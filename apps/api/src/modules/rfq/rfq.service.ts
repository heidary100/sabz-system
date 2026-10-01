import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  PartnerApprovalStatus,
  PaymentMethod,
  PriceStatus,
  Prisma,
  ProductStatus,
  RfqStatus,
} from '@prisma/client';
import type {
  PlaceOrderResult,
  RfqDto,
  RfqListResponse,
} from '@sabz/types';
import { RFQ_STATUS_FA } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { CheckoutService } from '../orders/checkout.service';
import { AcceptRfqDto } from './dto/accept-rfq.dto';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { QuoteRfqDto } from './dto/quote-rfq.dto';

/** Default quotation window: 7 days (pricing-engine.md §6 "configurable period"). */
export const RFQ_DEFAULT_EXPIRY_DAYS = 7;

const RFQ_WITH_VARIANT = {
  id: true,
  userId: true,
  variantId: true,
  quantity: true,
  status: true,
  quotedUnitPrice: true,
  expiresAt: true,
  orderId: true,
  createdAt: true,
  variant: {
    select: {
      sku: true,
      product: { select: { slug: true, name: true } },
    },
  },
} as const;

type RfqWithVariant = Prisma.RfqGetPayload<{ select: typeof RFQ_WITH_VARIANT }>;

/**
 * Request-for-quotation workflow (SS-235 B2, pricing-engine.md §6 + §8).
 *
 * Only APPROVED partners may file, and only against CALL_FOR_PRICE
 * variants (PRICE-008 — RFQ products stay non-purchasable through cart
 * and checkout until a quotation is accepted). The operator quote is the
 * price agreement: accept freezes `quotedUnitPrice` into an order via
 * `CheckoutService.placeQuotedOrder` and never re-resolves through
 * `PricingService.resolveLine`. Expiry is lazy-marked on read and
 * hard-enforced on accept (410). Every transition writes an audit event
 * (spec §11).
 */
@Injectable()
export class RfqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkout: CheckoutService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  /** Partner files a quotation request against a call-for-price variant. */
  async create(
    userId: string,
    dto: CreateRfqDto,
    ipAddress?: string,
  ): Promise<RfqDto> {
    await this.requireApprovedPartner(userId);
    const variant = await this.requireQuotableVariant(dto.variantId);
    const created = await this.prisma.rfq.create({
      data: {
        userId,
        variantId: variant.id,
        quantity: dto.quantity,
        status: RfqStatus.PENDING,
        expiresAt: new Date(
          Date.now() + RFQ_DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        ),
        createdBy: userId,
      },
      select: RFQ_WITH_VARIANT,
    });
    await this.audit.log({
      userId,
      action: 'RFQ_CREATED',
      entity: 'Rfq',
      entityId: created.id,
      after: { variantId: variant.id, quantity: dto.quantity },
      ipAddress,
    });
    // SS-243: operator alert (best-effort, never throws).
    await this.notifications.notifyOperators({
      type: 'RFQ_CREATED',
      title: 'استعلام جدید',
      body: 'یک استعلام قیمت جدید ثبت شد.',
      entity: 'Rfq',
      entityId: created.id,
    });
    return this.toDto(created);
  }

  /** Newest-first RFQ list: own rows, or every row for operators. */
  async list(
    userId: string,
    query: { page?: number; limit?: number; status?: RfqStatus },
    operator: boolean,
  ): Promise<RfqListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.RfqWhereInput = {
      ...(operator ? {} : { userId }),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.rfq.count({ where }),
      this.prisma.rfq.findMany({
        where,
        select: RFQ_WITH_VARIANT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const fresh = await this.expireOverdue(rows);
    return { items: fresh.map((row) => this.toDto(row)), total };
  }

  /** Single RFQ: owner or operator, otherwise 404 (no cross-user leak). */
  async detail(
    userId: string,
    id: string,
    operator: boolean,
  ): Promise<RfqDto> {
    const row = await this.requireVisible(userId, id, operator);
    const fresh = (await this.expireOverdue([row]))[0];
    if (!fresh) {
      throw new NotFoundException('استعلام یافت نشد.');
    }
    return this.toDto(fresh);
  }

  /** Operator prices a pending request (full admin UI arrives with SS-240). */
  async quote(
    operatorId: string,
    id: string,
    dto: QuoteRfqDto,
    ipAddress?: string,
  ): Promise<RfqDto> {
    const row = await this.requireVisible(operatorId, id, true);
    if (row.status !== RfqStatus.PENDING) {
      throw new ConflictException(
        'این استعلام در وضعیت قابل قیمت‌گذاری نیست.',
      );
    }
    const unitPrice = new Prisma.Decimal(dto.unitPrice);
    if (!unitPrice.isFinite() || unitPrice.lessThanOrEqualTo(0)) {
      throw new BadRequestException('مبلغ قیمت‌گذاری‌شده باید بزرگتر از صفر باشد.');
    }
    const expiresAt = this.resolveExpiry(dto.expiresAt);
    const updated = await this.prisma.rfq.update({
      where: { id: row.id },
      data: {
        status: RfqStatus.QUOTED,
        quotedUnitPrice: unitPrice,
        expiresAt,
        quotedBy: operatorId,
        quotedAt: new Date(),
        updatedBy: operatorId,
      },
      select: RFQ_WITH_VARIANT,
    });
    await this.audit.log({
      userId: operatorId,
      action: 'RFQ_QUOTED',
      entity: 'Rfq',
      entityId: row.id,
      before: { status: row.status },
      after: {
        status: RfqStatus.QUOTED,
        quotedUnitPrice: unitPrice.toString(),
        expiresAt: expiresAt.toISOString(),
      },
      ipAddress,
    });
    // SS-243: owner quotation notice (best-effort, never throws).
    await this.notifications.notify(row.userId, {
      type: 'RFQ_QUOTED',
      title: 'استعلام قیمت‌گذاری شد',
      body: 'برای استعلام شما قیمت اعلام شد؛ آن را بررسی و پذیرش کنید.',
      entity: 'Rfq',
      entityId: row.id,
    });
    return this.toDto(updated);
  }

  /** Operator declines a pending or quoted request. */
  async reject(
    operatorId: string,
    id: string,
    ipAddress?: string,
  ): Promise<RfqDto> {
    const row = await this.requireVisible(operatorId, id, true);
    if (
      row.status !== RfqStatus.PENDING &&
      row.status !== RfqStatus.QUOTED
    ) {
      throw new ConflictException('این استعلام در وضعیت قابل رد نیست.');
    }
    const updated = await this.prisma.rfq.update({
      where: { id: row.id },
      data: { status: RfqStatus.REJECTED, updatedBy: operatorId },
      select: RFQ_WITH_VARIANT,
    });
    await this.audit.log({
      userId: operatorId,
      action: 'RFQ_REJECTED',
      entity: 'Rfq',
      entityId: row.id,
      before: { status: row.status },
      after: { status: RfqStatus.REJECTED },
      ipAddress,
    });
    // SS-243: owner decision notice (best-effort, never throws).
    await this.notifications.notify(row.userId, {
      type: 'RFQ_DECIDED',
      title: 'استعلام رد شد',
      body: 'استعلام شما رد شد.',
      entity: 'Rfq',
      entityId: row.id,
    });
    return this.toDto(updated);
  }

  /**
   * Partner accepts a live quotation: freezes the quoted unit into an
   * order (CART-004 — the client never sends money) and marks the RFQ
   * ACCEPTED atomically. Expired quotations 410; re-accept replays the
   * original order reference (idempotent).
   */
  async accept(
    userId: string,
    id: string,
    dto: AcceptRfqDto,
    ipAddress?: string,
  ): Promise<PlaceOrderResult> {
    const row = await this.requireVisible(userId, id, false);
    if (row.status === RfqStatus.ACCEPTED && row.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: row.orderId },
        select: { id: true, orderNumber: true, status: true, total: true },
      });
      if (order) {
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status as PlaceOrderResult['status'],
          total: order.total.toString(),
        };
      }
    }
    if (row.status === RfqStatus.REJECTED) {
      throw new ConflictException('این استعلام رد شده است.');
    }
    if (row.status === RfqStatus.EXPIRED || row.expiresAt.getTime() <= Date.now()) {
      await this.markExpired(row, userId, ipAddress);
      throw new GoneException('مهلت پذیرش این استعلام به پایان رسیده است.');
    }
    if (row.status !== RfqStatus.QUOTED || row.quotedUnitPrice === null) {
      throw new ConflictException('برای این استعلام هنوز قیمتی اعلام نشده است.');
    }
    const result = await this.checkout.placeQuotedOrder(userId, {
      rfqId: row.id,
      variantId: row.variantId,
      quantity: row.quantity,
      unitPrice: row.quotedUnitPrice,
      addressId: dto.addressId,
      paymentMethod: dto.paymentMethod as PaymentMethod,
      shippingMethod: dto.shippingMethod,
    });
    await this.audit.log({
      userId,
      action: 'RFQ_ACCEPTED',
      entity: 'Rfq',
      entityId: row.id,
      before: { status: row.status },
      after: { status: RfqStatus.ACCEPTED, orderId: result.orderId },
      ipAddress,
    });
    // SS-243: owner acceptance notice (best-effort; the order-placed
    // notice already fired inside placeQuotedOrder).
    await this.notifications.notify(userId, {
      type: 'RFQ_DECIDED',
      title: 'استعلام پذیرفته شد',
      body: `استعلام شما پذیرفته شد و سفارش ${result.orderNumber} ساخته شد.`,
      entity: 'Rfq',
      entityId: row.id,
    });
    return result;
  }

  /** OPERATOR/ADMIN role check for the owner-or-operator reads. */
  async isOperator(userId: string): Promise<boolean> {
    try {
      const count = await this.prisma.userRole.count({
        where: {
          userId,
          role: { name: { in: ['OPERATOR', 'ADMIN'] } },
        },
      });
      return count > 0;
    } catch {
      return false;
    }
  }

  private async requireApprovedPartner(userId: string): Promise<void> {
    let partner: { id: string } | null = null;
    try {
      partner = await this.prisma.partner.findFirst({
        where: {
          profile: { userId },
          approvalStatus: PartnerApprovalStatus.APPROVED,
          deletedAt: null,
        },
        select: { id: true },
      });
    } catch {
      partner = null;
    }
    if (!partner) {
      throw new ForbiddenException(
        'ثبت استعلام فقط برای همکاران تأییدشده امکان‌پذیر است.',
      );
    }
  }

  private async requireQuotableVariant(
    variantId: string,
  ): Promise<{ id: string }> {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        deletedAt: null,
        product: { deletedAt: null, status: ProductStatus.PUBLISHED },
      },
      select: { id: true, priceStatus: true },
    });
    if (!variant) {
      throw new NotFoundException('مدل درخواستی یافت نشد.');
    }
    if (variant.priceStatus !== PriceStatus.CALL_FOR_PRICE) {
      throw new UnprocessableEntityException(
        'این مدل قیمت قطعی دارد؛ استعلام فقط برای مدل‌های بدون قیمت ثبت می‌شود.',
      );
    }
    return variant;
  }

  private async requireVisible(
    userId: string,
    id: string,
    operator: boolean,
  ): Promise<RfqWithVariant> {
    const row = await this.prisma.rfq.findUnique({
      where: { id },
      select: RFQ_WITH_VARIANT,
    });
    if (!row || (!operator && row.userId !== userId)) {
      throw new NotFoundException('استعلام یافت نشد.');
    }
    return row;
  }

  /** Lazy expiry: past-due PENDING/QUOTED rows flip to EXPIRED + audit. */
  private async expireOverdue(
    rows: RfqWithVariant[],
  ): Promise<RfqWithVariant[]> {
    const now = Date.now();
    return Promise.all(
      rows.map(async (row) => {
        if (
          (row.status === RfqStatus.PENDING ||
            row.status === RfqStatus.QUOTED) &&
          row.expiresAt.getTime() <= now
        ) {
          const updated = await this.prisma.rfq.update({
            where: { id: row.id },
            data: { status: RfqStatus.EXPIRED },
            select: RFQ_WITH_VARIANT,
          });
          await this.audit.log({
            action: 'RFQ_EXPIRED',
            entity: 'Rfq',
            entityId: row.id,
            before: { status: row.status },
            after: { status: RfqStatus.EXPIRED },
          });
          return updated;
        }
        return row;
      }),
    );
  }

  private async markExpired(
    row: RfqWithVariant,
    userId: string,
    ipAddress?: string,
  ): Promise<void> {
    if (
      row.status === RfqStatus.PENDING ||
      row.status === RfqStatus.QUOTED
    ) {
      await this.prisma.rfq.update({
        where: { id: row.id },
        data: { status: RfqStatus.EXPIRED },
      });
      await this.audit.log({
        userId,
        action: 'RFQ_EXPIRED',
        entity: 'Rfq',
        entityId: row.id,
        before: { status: row.status },
        after: { status: RfqStatus.EXPIRED },
        ipAddress,
      });
    }
  }

  private resolveExpiry(expiresAt: string | undefined): Date {
    if (expiresAt !== undefined) {
      const parsed = new Date(expiresAt);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        throw new BadRequestException('مهلت استعلام باید تاریخی در آینده باشد.');
      }
      return parsed;
    }
    return new Date(
      Date.now() + RFQ_DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );
  }

  private toDto(row: RfqWithVariant): RfqDto {
    const quoted =
      row.quotedUnitPrice === null
        ? null
        : new Prisma.Decimal(row.quotedUnitPrice.toString());
    return {
      id: row.id,
      variantId: row.variantId,
      productSlug: row.variant.product.slug,
      productName: row.variant.product.name,
      variantSku: row.variant.sku,
      quantity: row.quantity,
      status: row.status as RfqDto['status'],
      statusFa: RFQ_STATUS_FA[row.status as RfqDto['status']],
      quotedUnitPrice: quoted === null ? null : quoted.toString(),
      quotedLineTotal:
        quoted === null ? null : quoted.mul(row.quantity).toString(),
      expiresAt: row.expiresAt.toISOString(),
      orderId: row.orderId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
