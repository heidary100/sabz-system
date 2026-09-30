import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, ReturnStatus } from '@prisma/client';
import type {
  AdminReturnListResponse,
  ReturnListResponse,
  ReturnRequestDto,
  ReturnStatus as ReturnStatusDto,
} from '@sabz/types';
import { RETURN_STATUS_FA } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateReturnRequestDto,
  ListAdminReturnsQueryDto,
  ReturnListQueryDto,
} from './dto';

/** Return window in days after delivery (spec §8 business policy). */
export const RETURN_WINDOW_DAYS = 7;

/** Terminal states — a new request may be filed after these. */
const CLOSED_STATES: ReturnStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];

const RETURN_ITEM_SELECT = {
  id: true,
  orderItemId: true,
  variantId: true,
  productName: true,
  variantName: true,
  sku: true,
  quantity: true,
} as const;

const RETURN_SELECT = {
  id: true,
  orderId: true,
  status: true,
  reason: true,
  rejectReason: true,
  receivedAt: true,
  completedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  order: { select: { orderNumber: true } },
  items: { select: RETURN_ITEM_SELECT },
} as const;

const ADMIN_RETURN_SELECT = {
  ...RETURN_SELECT,
  userId: true,
  user: { select: { mobile: true } },
} as const;

type ReturnRow = Prisma.ReturnRequestGetPayload<{ select: typeof RETURN_SELECT }>;

type AdminReturnRow = Prisma.ReturnRequestGetPayload<{
  select: typeof ADMIN_RETURN_SELECT;
}>;

/**
 * Returns workflow (SS-242, master plan §6 Stage 3 + spec order-management
 * §8 + UML Return Flow).
 *
 * Owners file against owned DELIVERED orders inside the return window;
 * operators move PENDING → APPROVED/REJECTED → RECEIVED → COMPLETED.
 * Reads are newest-first (createdAt DESC, id DESC). Unknown/other-user ids
 * are non-disclosure 404s (RFQ precedent). Every mutation writes one audit
 * event (UPPER_SNAKE, entity 'ReturnRequest'). No order-status mutation and
 * no restock/refund side effects — the request records the decision only.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Owner files a return request for an owned DELIVERED order. */
  async create(
    userId: string,
    dto: CreateReturnRequestDto,
    ipAddress?: string,
  ): Promise<ReturnRequestDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        status: true,
        updatedAt: true,
        items: {
          select: {
            id: true,
            variantId: true,
            productName: true,
            variantName: true,
            sku: true,
            quantity: true,
          },
        },
      },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('سفارش یافت نشد.');
    }
    if (order.status !== 'DELIVERED') {
      throw new UnprocessableEntityException(
        'فقط سفارش‌های تحویل‌شده قابل مرجوع هستند.',
      );
    }
    const ageMs = Date.now() - order.updatedAt.getTime();
    if (ageMs > RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      throw new UnprocessableEntityException(
        'مهلت مرجوعی این سفارش به پایان رسیده است.',
      );
    }

    const byId = new Map(order.items.map((item) => [item.id, item]));
    const seen = new Set<string>();
    for (const line of dto.items) {
      if (seen.has(line.orderItemId)) {
        throw new UnprocessableEntityException(
          'هر قلم سفارش فقط یک‌بار در درخواست مرجوعی قابل ثبت است.',
        );
      }
      seen.add(line.orderItemId);
      const source = byId.get(line.orderItemId);
      if (!source) {
        throw new UnprocessableEntityException(
          'یکی از اقلام انتخاب‌شده متعلق به این سفارش نیست.',
        );
      }
      if (line.quantity > source.quantity) {
        throw new UnprocessableEntityException(
          'مقدار مرجوعی نمی‌تواند بیشتر از مقدار سفارش باشد.',
        );
      }
    }

    const open = await this.prisma.returnRequest.findFirst({
      where: {
        orderId: dto.orderId,
        status: { in: ['PENDING', 'APPROVED', 'RECEIVED'] },
      },
      select: { id: true },
    });
    if (open) {
      throw new ConflictException(
        'برای این سفارش یک درخواست مرجوعی باز وجود دارد.',
      );
    }

    try {
      const created = await this.prisma.returnRequest.create({
        data: {
          userId,
          orderId: dto.orderId,
          status: ReturnStatus.PENDING,
          reason: dto.reason.trim(),
          createdBy: userId,
          items: {
            create: dto.items.map((line) => {
              const source = byId.get(line.orderItemId)!;
              return {
                orderItemId: source.id,
                variantId: source.variantId,
                productName: source.productName,
                variantName: source.variantName,
                sku: source.sku,
                quantity: line.quantity,
              };
            }),
          },
        },
        select: RETURN_SELECT,
      });
      await this.audit.log({
        userId,
        action: 'RETURN_REQUESTED',
        entity: 'ReturnRequest',
        entityId: created.id,
        after: { orderId: dto.orderId, items: dto.items.length },
        ipAddress,
      });
      return toDto(created);
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ConflictException(
        'برای این سفارش یک درخواست مرجوعی باز وجود دارد.',
      );
    }
  }

  /** Owner lists their own requests, newest first. */
  async list(
    userId: string,
    query: ReturnListQueryDto,
  ): Promise<ReturnListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.ReturnRequestWhereInput = { userId };
    if (query.status) where.status = query.status as ReturnStatus;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.returnRequest.count({ where }),
      this.prisma.returnRequest.findMany({
        where,
        select: RETURN_SELECT,
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: rows.map(toDto), total, page, limit };
  }

  /** Owner reads one of their requests (operators pass operator=true). */
  async detail(
    userId: string,
    id: string,
    operator = false,
  ): Promise<ReturnRequestDto> {
    const row = await this.prisma.returnRequest.findUnique({
      where: { id },
      select: { ...RETURN_SELECT, userId: true },
    });
    if (!row || (!operator && row.userId !== userId)) {
      throw new NotFoundException('درخواست مرجوعی یافت نشد.');
    }
    return toDto(row);
  }

  /** Owner withdraws a PENDING request. */
  async cancel(
    userId: string,
    id: string,
    ipAddress?: string,
  ): Promise<ReturnRequestDto> {
    const row = await this.requireOwned(userId, id);
    if (row.status !== ReturnStatus.PENDING) {
      throw new ConflictException('این درخواست دیگر قابل لغو نیست.');
    }
    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: ReturnStatus.CANCELLED,
        cancelledAt: new Date(),
        updatedBy: userId,
      },
      select: RETURN_SELECT,
    });
    await this.audit.log({
      userId,
      action: 'RETURN_CANCELLED',
      entity: 'ReturnRequest',
      entityId: id,
      before: { status: 'PENDING' },
      after: { status: 'CANCELLED' },
      ipAddress,
    });
    return toDto(updated);
  }

  /**
   * Operator queue (admin). Unscoped across all owners, newest first.
   * Defaults to the PENDING worklist. Read-only — no audit.
   */
  async listForAdmin(
    query: ListAdminReturnsQueryDto,
  ): Promise<AdminReturnListResponse> {
    const status = query.status ?? 'PENDING';
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { status: status as ReturnStatus };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.returnRequest.count({ where }),
      this.prisma.returnRequest.findMany({
        where,
        select: ADMIN_RETURN_SELECT,
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: rows.map(toAdminDto), total, page, limit };
  }

  /** Operator reads any request with owner identity. */
  async adminDetail(id: string) {
    const row = await this.prisma.returnRequest.findUnique({
      where: { id },
      select: ADMIN_RETURN_SELECT,
    });
    if (!row) throw new NotFoundException('درخواست مرجوعی یافت نشد.');
    return toAdminDto(row);
  }

  /** Operator approves a PENDING request (→ APPROVED, awaiting receipt). */
  async approve(operatorId: string, id: string, ipAddress?: string) {
    await this.requireStatus(id, [ReturnStatus.PENDING]);
    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: { status: ReturnStatus.APPROVED, updatedBy: operatorId },
      select: ADMIN_RETURN_SELECT,
    });
    await this.audit.log({
      userId: operatorId,
      action: 'RETURN_APPROVED',
      entity: 'ReturnRequest',
      entityId: id,
      before: { status: 'PENDING' },
      after: { status: 'APPROVED' },
      ipAddress,
    });
    return toAdminDto(updated);
  }

  /** Operator rejects a PENDING request (stays closed, reason required). */
  async reject(
    operatorId: string,
    id: string,
    reason: string,
    ipAddress?: string,
  ) {
    await this.requireStatus(id, [ReturnStatus.PENDING]);
    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: ReturnStatus.REJECTED,
        rejectReason: reason.trim(),
        updatedBy: operatorId,
      },
      select: ADMIN_RETURN_SELECT,
    });
    await this.audit.log({
      userId: operatorId,
      action: 'RETURN_REJECTED',
      entity: 'ReturnRequest',
      entityId: id,
      before: { status: 'PENDING' },
      after: { status: 'REJECTED' },
      ipAddress,
    });
    return toAdminDto(updated);
  }

  /** Operator marks an APPROVED request received (→ RECEIVED). */
  async receive(operatorId: string, id: string, ipAddress?: string) {
    await this.requireStatus(id, [ReturnStatus.APPROVED]);
    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: ReturnStatus.RECEIVED,
        receivedAt: new Date(),
        updatedBy: operatorId,
      },
      select: ADMIN_RETURN_SELECT,
    });
    await this.audit.log({
      userId: operatorId,
      action: 'RETURN_RECEIVED',
      entity: 'ReturnRequest',
      entityId: id,
      before: { status: 'APPROVED' },
      after: { status: 'RECEIVED' },
      ipAddress,
    });
    return toAdminDto(updated);
  }

  /** Operator closes a RECEIVED request after inspection (→ COMPLETED). */
  async complete(operatorId: string, id: string, ipAddress?: string) {
    await this.requireStatus(id, [ReturnStatus.RECEIVED]);
    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status: ReturnStatus.COMPLETED,
        completedAt: new Date(),
        updatedBy: operatorId,
      },
      select: ADMIN_RETURN_SELECT,
    });
    await this.audit.log({
      userId: operatorId,
      action: 'RETURN_COMPLETED',
      entity: 'ReturnRequest',
      entityId: id,
      before: { status: 'RECEIVED' },
      after: { status: 'COMPLETED' },
      ipAddress,
    });
    return toAdminDto(updated);
  }

  private async requireOwned(userId: string, id: string) {
    const row = await this.prisma.returnRequest.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });
    if (!row || row.userId !== userId) {
      throw new NotFoundException('درخواست مرجوعی یافت نشد.');
    }
    return row;
  }

  private async requireStatus(id: string, allowed: ReturnStatus[]) {
    const row = await this.prisma.returnRequest.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!row) throw new NotFoundException('درخواست مرجوعی یافت نشد.');
    if (!allowed.includes(row.status)) {
      throw new ConflictException('این درخواست در وضعیت قابل انجام نیست.');
    }
    return row;
  }
}

function toDto(row: ReturnRow): ReturnRequestDto {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    status: row.status as ReturnStatusDto,
    statusFa: RETURN_STATUS_FA[row.status],
    reason: row.reason,
    rejectReason: row.rejectReason,
    items: row.items.map((item) => ({ ...item })),
    receivedAt: row.receivedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAdminDto(
  row: AdminReturnRow,
): AdminReturnListResponse['items'][number] {
  return {
    ...toDto(row),
    userId: row.userId,
    customerMobile: row.user.mobile,
  };
}

export { CLOSED_STATES };
