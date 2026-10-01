import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PriceStatus,
  Prisma,
  ProductStatus,
  RfqStatus,
  ShipmentStatus,
} from '@prisma/client';
import type {
  AdminOrderDetailDto,
  AdminOrderListItemDto,
  AdminOrderListResponse,
  AdminOrderTransition,
  CheckoutLineDto,
  CheckoutProblemCode,
  CheckoutProblemDto,
  CheckoutSummaryDto,
  OrderAddressSnapshot,
  OrderDetailDto,
  OrderItemDto,
  OrderListItemDto,
  OrderListResponse,
  PaymentMethodDto,
  PlaceOrderResult,
  ShipmentDto,
  ShippingMethodCode,
  ShippingMethodDto,
  TrackingEventDto,
} from '@sabz/types';
import {
  ORDER_STATUS_FA,
  SHIPMENT_STATUS_FA,
  SHIPPING_METHOD_FA,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import {
  activeInventoryWhere,
  deriveAvailable,
} from '../inventory/inventory-aggregate';
import { InventoryService } from '../inventory/inventory.service';
import { PricingService } from '../pricing/pricing.service';

/**
 * Shipping catalogue (SS-241). No carrier credentials exist in-repo, so
 * Tipax/Post are honest stubs: every method is env-driven
 * (`SHIPPING_<CODE>_ENABLED` + `SHIPPING_<CODE>_FEE`, flat Rial) and read
 * at request time like the SS-234 payment flags. Disabled methods stay
 * listed with `enabled: false` so the storefront disables instead of
 * hiding; unset/invalid fees fall back to "0", never fatal.
 */
const SHIPPING_METHOD_DEFS: Array<{
  code: ShippingMethodCode;
  titleFa: string;
  etaFa: string;
  envPrefix: string;
}> = [
  { code: 'TIPAX', titleFa: 'تیپاکس', etaFa: '۲ تا ۴ روز کاری', envPrefix: 'SHIPPING_TIPAX' },
  { code: 'IRAN_POST', titleFa: 'پست ایران', etaFa: '۳ تا ۷ روز کاری', envPrefix: 'SHIPPING_POST' },
  {
    code: 'LOCAL_DELIVERY',
    titleFa: 'ارسال درون‌شهری ساری',
    etaFa: '۱ تا ۲ روز کاری',
    envPrefix: 'SHIPPING_LOCAL',
  },
  {
    code: 'STORE_PICKUP',
    titleFa: 'تحویل حضوری از فروشگاه',
    etaFa: 'پس از هماهنگی',
    envPrefix: 'SHIPPING_PICKUP',
  },
];

const SHIPPING_METHOD_CODES = SHIPPING_METHOD_DEFS.map((def) => def.code);

function isShippingEnabled(code: ShippingMethodCode): boolean {
  const def = SHIPPING_METHOD_DEFS.find((row) => row.code === code);
  if (!def) {
    return false;
  }
  return process.env[`${def.envPrefix}_ENABLED`] !== 'false';
}

function shippingFeeFor(code: ShippingMethodCode): Prisma.Decimal {
  const def = SHIPPING_METHOD_DEFS.find((row) => row.code === code);
  const raw = def ? process.env[`${def.envPrefix}_FEE`]?.trim() : undefined;
  if (!raw) {
    return new Prisma.Decimal(0);
  }
  try {
    const fee = new Prisma.Decimal(raw);
    if (!fee.isFinite() || fee.lessThan(0)) {
      return new Prisma.Decimal(0);
    }
    return fee;
  } catch {
    return new Prisma.Decimal(0);
  }
}

function buildShippingMethods(): ShippingMethodDto[] {
  return SHIPPING_METHOD_DEFS.map((def) => ({
    code: def.code,
    titleFa: def.titleFa,
    etaFa: def.etaFa,
    fee: shippingFeeFor(def.code).toString(),
    enabled: isShippingEnabled(def.code),
  }));
}

/**
 * COD-only payment catalogue (SS-234). Availability is env-driven and read
 * at request time (no DI change — `process.env` is populated by
 * ConfigModule/dotenv in every runtime incl. e2e):
 * - `COD_ENABLED=false` disables cash on delivery (default enabled).
 * - `PAYMENTS_ONLINE_ENABLED=true` enables ONLINE (default disabled until
 *   the gateway ticket lands with server-side verification).
 */
function isOnlinePaymentsEnabled(): boolean {
  return process.env.PAYMENTS_ONLINE_ENABLED === 'true';
}

function isCodEnabled(): boolean {
  return process.env.COD_ENABLED !== 'false';
}

function buildPaymentMethods(): PaymentMethodDto[] {
  const onlineEnabled = isOnlinePaymentsEnabled();
  return [
    {
      code: 'ONLINE',
      titleFa: 'پرداخت آنلاین',
      descFa: onlineEnabled
        ? 'پرداخت اینترنتی پس از ثبت سفارش.'
        : 'پرداخت اینترنتی به‌زودی فعال می‌شود؛ در حال حاضر پرداخت در محل را انتخاب کنید.',
      enabled: onlineEnabled,
    },
    {
      code: 'COD',
      titleFa: 'پرداخت در محل',
      descFa: 'پرداخت نقدی هنگام تحویل برای سفارش‌های مجاز.',
      enabled: isCodEnabled(),
    },
  ];
}

const LINE_WITH_VARIANT = {
  id: true,
  cartId: true,
  quantity: true,
  unitPriceAtAdd: true,
  variantId: true,
  variant: {
    select: {
      sku: true,
      name: true,
      price: true,
      priceStatus: true,
      deletedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          status: true,
          deletedAt: true,
          categoryId: true,
          brandId: true,
        },
      },
    },
  },
} as const;

type CartLine = Prisma.CartItemGetPayload<{ select: typeof LINE_WITH_VARIANT }>;

/**
 * Minimal priced line (SS-235 B2). `reserveAll` only needs identity,
 * quantity, and the snapshot fields — both cart lines and RFQ accept
 * lines satisfy this shape, so quoted orders reuse the same
 * reserve → consume → create machinery.
 */
interface QuotableLine {
  variantId: string;
  quantity: number;
  variant: {
    price: Prisma.Decimal;
    name: string | null;
    sku: string;
    product: { name: string };
  };
}

interface AllocationSlice {
  variantId: string;
  warehouseId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  productName: string;
  variantName: string | null;
  sku: string;
  reservationId: string;
}

/**
 * Checkout + customer orders (SS-233).
 *
 * Price truth (CART-004): every total is computed from live variant rows
 * read inside this flow — the client never sends money. SS-235 resolves
 * each line server-side (retail base → partner tier → bulk → scheduled
 * promotion) before reserving, so the frozen order snapshot carries the
 * priced unit, never the raw catalog price. Inventory (CART-005): nothing
 * is reserved by the cart; this flow reserves per warehouse slice via
 * `InventoryService.reserve`, then consumes, so each mutation keeps its
 * ledger movement + audit. Compensation: partial reserves are released on
 * failure; stock consumed but left orderless by a failed order-create is
 * restocked via `receive` with an `order-failed` note (all best-effort,
 * then the original error rethrows).
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  shippingMethods(): { items: ShippingMethodDto[] } {
    return { items: buildShippingMethods() };
  }

  paymentMethods(): { items: PaymentMethodDto[] } {
    return { items: buildPaymentMethods() };
  }

  async validate(
    userId: string,
    addressId?: string,
    shippingMethod?: string,
  ): Promise<CheckoutSummaryDto> {
    if (addressId !== undefined) {
      await this.requireOwnAddress(userId, addressId);
    }
    const method = this.requireShippingMethod(shippingMethod);
    const lines = await this.cartLines(userId);
    if (lines.length === 0) {
      return {
        valid: false,
        items: [],
        subtotal: '0',
        shippingFee: '0',
        total: '0',
        problems: [],
      };
    }
    return (await this.summarize(userId, lines, shippingFeeFor(method))).summary;
  }

  async placeOrder(
    userId: string,
    addressId: string,
    paymentMethod: PaymentMethod,
    shippingMethod: string,
    ipAddress?: string,
  ): Promise<PlaceOrderResult> {
    this.assertPaymentEnabled(paymentMethod);
    const method = this.requireShippingMethod(shippingMethod);
    const address = await this.requireOwnAddress(userId, addressId);
    const lines = await this.cartLines(userId);
    if (lines.length === 0) {
      throw new BadRequestException('سبد خرید خالی است.');
    }
    const shippingFee = shippingFeeFor(method);
    const { summary, unitPrices } = await this.summarize(userId, lines, shippingFee);
    // Surface the first blocking problem with cart-mirroring semantics:
    // unpublished → 404, call-for-price → 422, shortage → 409 + available.
    const blocking = summary.problems.find((problem) =>
      this.isBlocking(problem.code),
    );
    if (blocking) {
      this.throwProblem(blocking);
    }
    const fulfillable = this.fulfillableLines(lines, summary);
    if (fulfillable.length === 0) {
      throw new BadRequestException('سبد خرید هیچ قلم قابل تسویه‌ای ندارد.');
    }

    const slices = await this.reserveAll(userId, fulfillable, unitPrices);
    await this.consumeAll(slices, userId);

    const orderNumber = await this.nextOrderNumber();
    const totals = this.totalsFor(slices, shippingFee);
    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            orderNumber,
            userId,
            status: OrderStatus.PENDING,
            paymentMethod,
            paymentStatus: 'PENDING',
            subtotal: totals.subtotal,
            shippingMethod: method,
            shippingFee,
            total: totals.total,
            fullName: address.fullName,
            phone: address.phone,
            province: address.province,
            city: address.city,
            address: address.address,
            postalCode: address.postalCode,
            shipment: {
              create: { method, status: ShipmentStatus.PENDING },
            },
            items: {
              create: slices.map((slice) => ({
                variantId: slice.variantId,
                warehouseId: slice.warehouseId,
                productName: slice.productName,
                variantName: slice.variantName,
                sku: slice.sku,
                quantity: slice.quantity,
                unitPrice: slice.unitPrice,
                lineTotal: slice.unitPrice.mul(slice.quantity),
              })),
            },
          },
          select: { id: true },
        });
        const cart = await tx.cart.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (cart) {
          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        }
        return created;
      });
      // SS-243: owner confirmation + operator alert (best-effort, never
      // throws — the order is already committed above).
      await this.notifications.notify(userId, {
        type: 'ORDER_PLACED',
        title: 'سفارش شما ثبت شد',
        body: `سفارش ${orderNumber} با موفقیت ثبت شد.`,
        entity: 'Order',
        entityId: order.id,
      });
      await this.notifications.notifyOperators({
        type: 'ORDER_PLACED',
        title: 'سفارش جدید',
        body: `سفارش ${orderNumber} ثبت شد.`,
        entity: 'Order',
        entityId: order.id,
      });
      // SS-244A: money-movement audit (operator transitions already log
      // ORDER_STATUS_CHANGED; this covers the customer placement itself).
      await this.audit.log({
        userId,
        action: 'ORDER_PLACED',
        entity: 'Order',
        entityId: order.id,
        after: { orderNumber, total: totals.total.toString() },
        ipAddress,
      });
      return {
        orderId: order.id,
        orderNumber,
        status: 'PENDING',
        total: totals.total.toString(),
      };
    } catch (error) {
      // Stock is consumed but orderless: restock every slice so units
      // re-enter availability with an auditable note.
      await this.restockSlices(userId, slices, `order-failed:${orderNumber}`);
      throw error;
    }
  }

  /**
   * RFQ accept → order (SS-235 B2). Freezes the operator-quoted unit into
   * a single-line order through the same reserve → consume → create
   * machinery as `placeOrder` (same sequence, payment gates, and
   * compensation) — the quote IS the price agreement, so the line never
   * re-resolves through `PricingService`. The RFQ flips to ACCEPTED in
   * the same transaction; a lost race (row already moved) restocks and
   * replays the winner's order reference instead of double-selling.
   */
  async placeQuotedOrder(
    userId: string,
    input: {
      rfqId: string;
      variantId: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      addressId: string;
      paymentMethod: PaymentMethod;
      shippingMethod: string;
      ipAddress?: string;
    },
  ): Promise<PlaceOrderResult> {
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new BadRequestException('تعداد درخواستی معتبر نیست.');
    }
    if (
      !input.unitPrice.isFinite() ||
      input.unitPrice.lessThanOrEqualTo(0)
    ) {
      throw new BadRequestException('مبلغ توافق‌شده معتبر نیست.');
    }
    this.assertPaymentEnabled(input.paymentMethod);
    const method = this.requireShippingMethod(input.shippingMethod);
    const shippingFee = shippingFeeFor(method);
    const address = await this.requireOwnAddress(userId, input.addressId);
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: input.variantId,
        deletedAt: null,
        product: { deletedAt: null, status: ProductStatus.PUBLISHED },
      },
      select: {
        sku: true,
        name: true,
        product: { select: { name: true } },
      },
    });
    if (!variant) {
      throw new NotFoundException('این مدل دیگر قابل خرید نیست.');
    }
    const available =
      (await this.availableFor([input.variantId])).get(input.variantId) ?? 0;
    if (available < input.quantity) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message:
          available <= 0
            ? 'این محصول فعلاً ناموجود است.'
            : `فقط ${available} عدد از این محصول موجود است.`,
        available,
      });
    }
    const line: QuotableLine = {
      variantId: input.variantId,
      quantity: input.quantity,
      variant: {
        price: input.unitPrice,
        name: variant.name,
        sku: variant.sku,
        product: { name: variant.product.name },
      },
    };
    const slices = await this.reserveAll(
      userId,
      [line],
      new Map([[input.variantId, input.unitPrice]]),
    );
    await this.consumeAll(slices, userId);

    const orderNumber = await this.nextOrderNumber();
    const totals = this.totalsFor(slices, shippingFee);
    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            orderNumber,
            userId,
            status: OrderStatus.PENDING,
            paymentMethod: input.paymentMethod,
            paymentStatus: 'PENDING',
            subtotal: totals.subtotal,
            shippingMethod: method,
            shippingFee,
            total: totals.total,
            fullName: address.fullName,
            phone: address.phone,
            province: address.province,
            city: address.city,
            address: address.address,
            postalCode: address.postalCode,
            shipment: {
              create: { method, status: ShipmentStatus.PENDING },
            },
            items: {
              create: slices.map((slice) => ({
                variantId: slice.variantId,
                warehouseId: slice.warehouseId,
                productName: slice.productName,
                variantName: slice.variantName,
                sku: slice.sku,
                quantity: slice.quantity,
                unitPrice: slice.unitPrice,
                lineTotal: slice.unitPrice.mul(slice.quantity),
              })),
            },
          },
          select: { id: true },
        });
        // Conditional flip: a concurrent accept already moved the row.
        await tx.rfq.update({
          where: { id: input.rfqId, status: RfqStatus.QUOTED },
          data: {
            status: RfqStatus.ACCEPTED,
            orderId: created.id,
            updatedBy: userId,
          },
        });
        return created;
      });
      // SS-243: owner confirmation + operator alert (best-effort; the lost
      // race below replays an already-notified order, so it stays silent).
      await this.notifications.notify(userId, {
        type: 'ORDER_PLACED',
        title: 'سفارش شما ثبت شد',
        body: `سفارش ${orderNumber} با موفقیت ثبت شد.`,
        entity: 'Order',
        entityId: order.id,
      });
      await this.notifications.notifyOperators({
        type: 'ORDER_PLACED',
        title: 'سفارش جدید',
        body: `سفارش ${orderNumber} ثبت شد.`,
        entity: 'Order',
        entityId: order.id,
      });
      // SS-244A: same placement audit as placeOrder (RFQ-quoted path).
      await this.audit.log({
        userId,
        action: 'ORDER_PLACED',
        entity: 'Order',
        entityId: order.id,
        after: { orderNumber, total: totals.total.toString(), rfqId: input.rfqId },
        ipAddress: input.ipAddress,
      });
      return {
        orderId: order.id,
        orderNumber,
        status: 'PENDING',
        total: totals.total.toString(),
      };
    } catch (error) {
      await this.restockSlices(userId, slices, `order-failed:${orderNumber}`);
      // Lost the accept race after consuming stock: the row already moved
      // (P2025 on the conditional flip). Restocked above — now replay the
      // winner's order reference instead of surfacing a raw Prisma error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        const replay = await this.replayAcceptedQuotedOrder(input.rfqId);
        if (replay) {
          return replay;
        }
      }
      throw error;
    }
  }

  /** Winner's order reference for a lost accept race (null when not accepted). */
  private async replayAcceptedQuotedOrder(
    rfqId: string,
  ): Promise<PlaceOrderResult | null> {
    try {
      const row = await this.prisma.rfq.findUnique({
        where: { id: rfqId },
        select: {
          status: true,
          order: {
            select: { id: true, orderNumber: true, status: true, total: true },
          },
        },
      });
      if (row?.status === RfqStatus.ACCEPTED && row.order) {
        return {
          orderId: row.order.id,
          orderNumber: row.order.orderNumber,
          status: row.order.status as PlaceOrderResult['status'],
          total: row.order.total.toString(),
        };
      }
    } catch {
      // Fall through to the original error below.
    }
    return null;
  }

  async listOrders(
    userId: string,
    query: {
      status?: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
      page?: number;
      limit?: number;
    },
  ): Promise<OrderListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = {
      userId,
      ...(query.status !== undefined ? { status: query.status } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const items: OrderListItemDto[] = rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status as OrderListItemDto['status'],
      statusFa: ORDER_STATUS_FA[row.status as keyof typeof ORDER_STATUS_FA],
      itemCount: row._count.items,
      total: row.total.toString(),
      createdAt: row.createdAt.toISOString(),
    }));
    return { items, total };
  }

  async orderDetail(userId: string, orderId: string): Promise<OrderDetailDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        subtotal: true,
        shippingMethod: true,
        shippingFee: true,
        total: true,
        fullName: true,
        phone: true,
        province: true,
        city: true,
        address: true,
        postalCode: true,
        createdAt: true,
        shipment: {
          select: {
            id: true,
            orderId: true,
            method: true,
            trackingNumber: true,
            status: true,
            shippedAt: true,
            deliveredAt: true,
            createdAt: true,
            updatedAt: true,
            events: {
              select: {
                id: true,
                status: true,
                location: true,
                note: true,
                createdAt: true,
              },
              orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
            },
          },
        },
        items: {
          select: {
            id: true,
            variantId: true,
            productName: true,
            variantName: true,
            sku: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
          orderBy: { id: 'asc' as const },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('سفارش یافت نشد.');
    }
    return this.toDetail(order);
  }

  async cancelOrder(
    userId: string,
    orderId: string,
    ipAddress?: string,
  ): Promise<OrderDetailDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        items: {
          select: { variantId: true, warehouseId: true, quantity: true },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('سفارش یافت نشد.');
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException('این سفارش دیگر قابل لغو نیست.');
    }
    // Restock first so a failed restock never leaves a cancelled-but-
    // unreplenished order; consumed units return with an auditable note.
    for (const item of order.items) {
      try {
        await this.inventory.receive(
          {
            variantId: item.variantId,
            warehouseId: item.warehouseId,
            quantity: item.quantity,
            notes: `order-cancel:${order.orderNumber}`,
          },
          userId,
        );
      } catch (error) {
        this.logger.warn(
          `Cancel restock failed order=${order.id} variant=${item.variantId}: ${error}`,
        );
        throw new ConflictException(
          'لغو سفارش به دلیل مغایرت موجودی ممکن نیست؛ با پشتیبانی در تماس باشید.',
        );
      }
    }
    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.CANCELLED },
    });
    // SS-244A: owner-cancel audit (restock notes already carry the trail;
    // this records the status decision itself).
    await this.audit.log({
      userId,
      action: 'ORDER_CANCELLED',
      entity: 'Order',
      entityId: order.id,
      before: { status: order.status },
      after: { status: OrderStatus.CANCELLED },
      ipAddress,
    });
    return this.orderDetail(userId, order.id);
  }

  /** Customer mobile for the invoice header (orders are user-scoped). */
  async customerMobile(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mobile: true },
    });
    return user.mobile;
  }

  // -------------------------------------------------------------------------
  // Operator reads + transitions (SS-240A). Unscoped: every row is visible.
  // -------------------------------------------------------------------------

  /**
   * Operator order list (SS-240A): newest-first across all users, same
   * paging contract as the customer history plus owner + mobile + payment
   * columns so the queue triages without a second lookup.
   */
  async listAllOrders(query: {
    status?: OrderListItemDto['status'];
    page?: number;
    limit?: number;
  }): Promise<AdminOrderListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = {
      ...(query.status !== undefined ? { status: query.status } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          createdAt: true,
          userId: true,
          paymentMethod: true,
          paymentStatus: true,
          user: { select: { mobile: true } },
          _count: { select: { items: true } },
        },
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const items: AdminOrderListItemDto[] = rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status as AdminOrderListItemDto['status'],
      statusFa: ORDER_STATUS_FA[row.status as keyof typeof ORDER_STATUS_FA],
      itemCount: row._count.items,
      total: row.total.toString(),
      createdAt: row.createdAt.toISOString(),
      userId: row.userId,
      customerMobile: row.user.mobile,
      paymentMethod: row.paymentMethod as AdminOrderListItemDto['paymentMethod'],
      paymentStatus: row.paymentStatus as AdminOrderListItemDto['paymentStatus'],
    }));
    return { items, total };
  }

  /** Operator order detail (SS-240A): full detail + owner + mobile. */
  async adminDetail(orderId: string): Promise<AdminOrderDetailDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        subtotal: true,
        shippingMethod: true,
        shippingFee: true,
        total: true,
        fullName: true,
        phone: true,
        province: true,
        city: true,
        address: true,
        postalCode: true,
        createdAt: true,
        userId: true,
        user: { select: { mobile: true } },
        shipment: {
          select: {
            id: true,
            orderId: true,
            method: true,
            trackingNumber: true,
            status: true,
            shippedAt: true,
            deliveredAt: true,
            createdAt: true,
            updatedAt: true,
            events: {
              select: {
                id: true,
                status: true,
                location: true,
                note: true,
                createdAt: true,
              },
              orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
            },
          },
        },
        items: {
          select: {
            id: true,
            variantId: true,
            productName: true,
            variantName: true,
            sku: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
          orderBy: { id: 'asc' as const },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('سفارش یافت نشد.');
    }
    return {
      ...this.toDetail(order),
      userId: order.userId,
      customerMobile: order.user.mobile,
    };
  }

  /**
   * Operator status transition (SS-240A). Legal moves only:
   * PENDING → PROCESSING | CANCELLED, PROCESSING → SHIPPED | CANCELLED,
   * SHIPPED → DELIVERED | CANCELLED; DELIVERED/CANCELLED are terminal.
   * Operator cancels restock like customer cancels (same auditable note).
   * COD orders flip PENDING → PAID exactly on the DELIVERED transition
   * (SS-234 deferred note) — ONLINE rows keep their gateway-set status.
   * Every transition writes one ORDER_STATUS_CHANGED audit event.
   */
  async transitionStatus(
    operatorId: string,
    orderId: string,
    next: AdminOrderTransition,
    ipAddress?: string,
  ): Promise<AdminOrderDetailDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        shippingMethod: true,
        items: {
          select: { variantId: true, warehouseId: true, quantity: true },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('سفارش یافت نشد.');
    }
    const current = order.status;
    const legal: Record<string, AdminOrderTransition[]> = {
      [OrderStatus.PENDING]: ['PROCESSING', 'CANCELLED'],
      [OrderStatus.PROCESSING]: ['SHIPPED', 'CANCELLED'],
      [OrderStatus.SHIPPED]: ['DELIVERED', 'CANCELLED'],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
    };
    if (!legal[current]?.includes(next)) {
      throw new ConflictException(
        `تغییر وضعیت سفارش از «${ORDER_STATUS_FA[current as keyof typeof ORDER_STATUS_FA]}» به «${ORDER_STATUS_FA[next as keyof typeof ORDER_STATUS_FA]}» مجاز نیست.`,
      );
    }
    if (next === 'CANCELLED') {
      for (const item of order.items) {
        try {
          await this.inventory.receive(
            {
              variantId: item.variantId,
              warehouseId: item.warehouseId,
              quantity: item.quantity,
              notes: `order-cancel:${order.orderNumber}`,
            },
            operatorId,
          );
        } catch (error) {
          this.logger.warn(
            `Operator cancel restock failed order=${order.id} variant=${item.variantId}: ${error}`,
          );
          throw new ConflictException(
            'لغو سفارش به دلیل مغایرت موجودی ممکن نیست؛ با پشتیبانی در تماس باشید.',
          );
        }
      }
    }
    // COD pays on delivery: the handover IS the payment event.
    const paidOnDelivery =
      next === 'DELIVERED' &&
      order.paymentMethod === 'COD' &&
      order.paymentStatus === 'PENDING';
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: next as OrderStatus,
        ...(paidOnDelivery ? { paymentStatus: 'PAID' } : {}),
      },
      select: { status: true, paymentStatus: true },
    });
    // SS-241: the shipment timeline follows the order lifecycle so the
    // customer timeline has data without operator double-entry (covered by
    // the ORDER_STATUS_CHANGED audit below — no separate shipment audit).
    await this.syncShipmentWithOrderTransition(
      order.id,
      order.shippingMethod,
      next,
    );
    await this.audit.log({
      userId: operatorId,
      action: 'ORDER_STATUS_CHANGED',
      entity: 'Order',
      entityId: order.id,
      before: { status: current, paymentStatus: order.paymentStatus },
      after: { status: updated.status, paymentStatus: updated.paymentStatus },
      ipAddress,
    });
    // SS-243: owner status notice (best-effort, never throws).
    await this.notifications.notify(order.userId, {
      type: 'ORDER_STATUS_CHANGED',
      title: 'وضعیت سفارش تغییر کرد',
      body: `سفارش ${order.orderNumber} به وضعیت «${ORDER_STATUS_FA[next as keyof typeof ORDER_STATUS_FA]}» رسید.`,
      entity: 'Order',
      entityId: order.id,
    });
    return this.adminDetail(order.id);
  }

  /**
   * Shipment side-effect of operator order transitions (SS-241): SHIPPED
   * hands the parcel over (PICKED_UP + checkpoint), DELIVERED closes the
   * loop, CANCELLED voids the shipment. Already-PENDING/terminal rows are
   * left untouched so replays stay idempotent.
   */
  private async syncShipmentWithOrderTransition(
    orderId: string,
    method: string,
    next: AdminOrderTransition,
  ): Promise<void> {
    const target =
      next === 'SHIPPED'
        ? ShipmentStatus.PICKED_UP
        : next === 'DELIVERED'
          ? ShipmentStatus.DELIVERED
          : next === 'CANCELLED'
            ? ShipmentStatus.CANCELLED
            : null;
    if (!target) {
      return;
    }
    const shipment = await this.ensureShipment(orderId, method);
    if (
      shipment.status === target ||
      shipment.status === ShipmentStatus.DELIVERED ||
      shipment.status === ShipmentStatus.CANCELLED
    ) {
      // Already there, or terminally diverged by an explicit operator
      // action (e.g. manually CANCELLED) — the order move still applies.
      return;
    }
    // The order lifecycle is the authority here: it may legitimately jump
    // (SHIPPED → DELIVERED skips the carrier middle-states), so the sync
    // records the decided state directly. The forward-only guard still
    // applies to manual operator edits (updateShipment/addTrackingEvent).
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.trackingEvent.create({
        data: { shipmentId: shipment.id, status: target },
      }),
      this.prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status: target,
          shippedAt: shipment.shippedAt ?? now,
          deliveredAt: target === ShipmentStatus.DELIVERED ? now : shipment.deliveredAt,
        },
      }),
    ]);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async requireOwnAddress(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
      select: {
        fullName: true,
        phone: true,
        province: true,
        city: true,
        address: true,
        postalCode: true,
      },
    });
    if (!address) {
      throw new NotFoundException('نشانی یافت نشد.');
    }
    return address;
  }

  private async cartLines(userId: string): Promise<CartLine[]> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!cart) {
      return [];
    }
    return this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      select: LINE_WITH_VARIANT,
    });
  }

  private async summarize(
    userId: string,
    lines: CartLine[],
    shippingFee: Prisma.Decimal = new Prisma.Decimal(0),
  ): Promise<{ summary: CheckoutSummaryDto; unitPrices: Map<string, Prisma.Decimal> }> {
    const visible = lines.filter(
      (line) =>
        line.variant.deletedAt === null &&
        line.variant.product.deletedAt === null &&
        line.variant.product.status === ProductStatus.PUBLISHED,
    );
    const availableByVariant = await this.availableFor([
      ...new Set(visible.map((line) => line.variantId)),
    ]);
    // SS-235: one tier lookup per summary; promotions resolve per line.
    // Resolved units are returned alongside so placeOrder freezes the same
    // priced unit it validated (never the raw variant price).
    const tierPct = await this.pricing.tierDiscountForUser(userId);
    const unitPrices = new Map<string, Prisma.Decimal>();
    for (const line of visible) {
      if (line.variant.priceStatus !== PriceStatus.PRICED) {
        continue;
      }
      const scope = {
        productId: line.variant.product.id,
        categoryId: line.variant.product.categoryId,
        brandId: line.variant.product.brandId,
      };
      const [promotions, categoryRule, override] = await Promise.all([
        this.pricing.activePromotionsFor(scope),
        this.pricing.categoryRuleFor(scope.categoryId),
        this.pricing.productOverrideFor(scope.productId),
      ]);
      unitPrices.set(
        line.variantId,
        PricingService.resolveLine(line.variant.price, line.quantity, tierPct, promotions, {
          categoryRule,
          override,
        }),
      );
    }

    const items: CheckoutLineDto[] = [];
    const problems: CheckoutProblemDto[] = [];
    let subtotal = new Prisma.Decimal(0);

    for (const line of lines) {
      const variantDeleted =
        line.variant.deletedAt !== null ||
        line.variant.product.deletedAt !== null ||
        line.variant.product.status !== ProductStatus.PUBLISHED;
      if (variantDeleted) {
        problems.push({
          variantId: line.variantId,
          code: 'UNPUBLISHED',
          message: 'این محصول دیگر قابل خرید نیست.',
          available: null,
        });
        continue;
      }
      if (line.variant.priceStatus !== PriceStatus.PRICED) {
        problems.push({
          variantId: line.variantId,
          code: 'CALL_FOR_PRICE',
          message:
            'این مدل قابل خرید اینترنتی نیست؛ برای استعلام قیمت با فروشگاه در تماس باشید.',
          available: null,
        });
        continue;
      }
      const available = availableByVariant.get(line.variantId) ?? 0;
      const inStock = available >= line.quantity;
      const unitPrice = (unitPrices.get(line.variantId) ?? line.variant.price).toString();
      const priceChanged = unitPrice !== line.unitPriceAtAdd.toString();
      const lineTotal = new Prisma.Decimal(unitPrice).mul(line.quantity).toString();
      items.push({
        variantId: line.variantId,
        productName: line.variant.product.name,
        variantSku: line.variant.sku,
        quantity: line.quantity,
        unitPrice,
        lineTotal,
        priceChanged,
        available,
        inStock,
      });
      if (priceChanged) {
        problems.push({
          variantId: line.variantId,
          code: 'PRICE_CHANGED',
          message: 'قیمت این محصول نسبت به زمان افزودن به سبد تغییر کرده است.',
          available,
        });
      }
      if (!inStock) {
        problems.push({
          variantId: line.variantId,
          code: 'OUT_OF_STOCK',
          message:
            available <= 0
              ? 'این محصول فعلاً ناموجود است.'
              : `فقط ${available} عدد از این محصول موجود است.`,
          available,
        });
      } else {
        subtotal = subtotal.add(new Prisma.Decimal(lineTotal));
      }
    }

    const blocking = problems.some((problem) => this.isBlocking(problem.code));
    return {
      summary: {
        valid: !blocking && items.some((item) => item.inStock),
        items,
        subtotal: subtotal.toString(),
        shippingFee: shippingFee.toString(),
        total: subtotal.add(shippingFee).toString(),
        problems,
      },
      unitPrices,
    };
  }

  private isBlocking(code: CheckoutProblemCode): boolean {
    return code === 'OUT_OF_STOCK' || code === 'UNPUBLISHED' || code === 'CALL_FOR_PRICE';
  }

  /**
   * SS-241 shipping gate, shared by cart checkout and RFQ accept: unknown
   * codes 422 (class-validator already rejects them at the DTO layer; this
   * is the service-level twin for programmatic callers), disabled methods
   * 422 before touching stock. Defaults to STORE_PICKUP when omitted
   * (validate preview only — place-order DTOs require it explicitly).
   */
  private requireShippingMethod(value: string | undefined): ShippingMethodCode {
    if (value === undefined) {
      return 'STORE_PICKUP';
    }
    if (!SHIPPING_METHOD_CODES.includes(value as ShippingMethodCode)) {
      throw new UnprocessableEntityException('شیوه ارسال معتبر نیست.');
    }
    const method = value as ShippingMethodCode;
    if (!isShippingEnabled(method)) {
      throw new UnprocessableEntityException(
        'این شیوه ارسال در حال حاضر فعال نیست؛ لطفاً شیوه دیگری را انتخاب کنید.',
      );
    }
    return method;
  }

  /**
   * Operator shipment update (SS-241). Lazily creates the shipment for
   * pre-SS-241 orders (method falls back to the stored order method), then
   * applies the tracking number and/or a forward-only status move. One
   * SHIPMENT_UPDATED audit per call.
   */
  async updateShipment(
    operatorId: string,
    orderId: string,
    input: { trackingNumber?: string; status?: ShipmentStatus },
    ipAddress?: string,
  ): Promise<AdminOrderDetailDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        shippingMethod: true,
        shipment: {
          select: {
            id: true,
            trackingNumber: true,
            status: true,
            shippedAt: true,
            deliveredAt: true,
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('سفارش یافت نشد.');
    }
    const shipment = await this.ensureShipment(order.id, order.shippingMethod);
    const before = {
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
    };
    const trackingNumber =
      input.trackingNumber === undefined
        ? shipment.trackingNumber
        : input.trackingNumber.trim() === ''
          ? null
          : input.trackingNumber.trim();
    let status = shipment.status;
    if (input.status !== undefined && input.status !== shipment.status) {
      this.assertShipmentTransition(shipment.status, input.status);
      status = input.status;
    }
    const now = new Date();
    const updated = await this.prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        trackingNumber,
        status,
        shippedAt:
          shipment.shippedAt ??
          (status !== ShipmentStatus.PENDING ? now : null),
        deliveredAt:
          status === ShipmentStatus.DELIVERED ? (shipment.deliveredAt ?? now) : null,
        updatedBy: operatorId,
      },
      select: { trackingNumber: true, status: true },
    });
    await this.audit.log({
      userId: operatorId,
      action: 'SHIPMENT_UPDATED',
      entity: 'Shipment',
      entityId: shipment.id,
      before,
      after: { trackingNumber: updated.trackingNumber, status: updated.status },
      ipAddress,
    });
    // SS-243: owner shipment notice (best-effort, never throws).
    await this.notifications.notify(order.userId, {
      type: 'SHIPMENT_UPDATED',
      title: 'مرسوله به‌روزرسانی شد',
      body:
        updated.trackingNumber !== null
          ? `کد رهگیری سفارش ${order.orderNumber}: ${updated.trackingNumber}`
          : `وضعیت مرسوله سفارش ${order.orderNumber} به‌روزرسانی شد.`,
      entity: 'Order',
      entityId: order.id,
    });
    return this.adminDetail(order.id);
  }

  /**
   * Operator tracking checkpoint (SS-241). Appends the event and advances
   * the shipment to the event status (forward-only plus CANCELLED). One
   * SHIPMENT_TRACKING_ADDED audit per call.
   */
  async addTrackingEvent(
    operatorId: string,
    orderId: string,
    input: { status: ShipmentStatus; location?: string; note?: string },
    ipAddress?: string,
  ): Promise<AdminOrderDetailDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        shippingMethod: true,
        shipment: { select: { id: true, status: true } },
      },
    });
    if (!order) {
      throw new NotFoundException('سفارش یافت نشد.');
    }
    const shipment = await this.ensureShipment(order.id, order.shippingMethod);
    if (input.status !== shipment.status) {
      this.assertShipmentTransition(shipment.status, input.status);
    } else {
      throw new ConflictException('این وضعیت قبلاً برای مرسوله ثبت شده است.');
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.trackingEvent.create({
        data: {
          shipmentId: shipment.id,
          status: input.status,
          location: input.location?.trim() ? input.location.trim() : null,
          note: input.note?.trim() ? input.note.trim() : null,
        },
      }),
      this.prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status: input.status,
          shippedAt: input.status !== ShipmentStatus.PENDING ? now : null,
          deliveredAt: input.status === ShipmentStatus.DELIVERED ? now : null,
          updatedBy: operatorId,
        },
      }),
    ]);
    await this.audit.log({
      userId: operatorId,
      action: 'SHIPMENT_TRACKING_ADDED',
      entity: 'Shipment',
      entityId: shipment.id,
      before: { status: shipment.status },
      after: { status: input.status },
      ipAddress,
    });
    // SS-243: owner tracking checkpoint notice (best-effort, never throws).
    await this.notifications.notify(order.userId, {
      type: 'SHIPMENT_UPDATED',
      title: 'مرسوله به‌روزرسانی شد',
      body: `مرسوله سفارش ${order.orderNumber} به مرحله بعد رسید.`,
      entity: 'Order',
      entityId: order.id,
    });
    return this.adminDetail(order.id);
  }

  /**
   * Lazily materializes the shipment row for pre-SS-241 orders (created
   * before the eager shipment on placement). Post-SS-241 orders always
   * have a row, so this is a no-op for them.
   */
  private async ensureShipment(
    orderId: string,
    method: string,
  ): Promise<{ id: string; trackingNumber: string | null; status: ShipmentStatus; shippedAt: Date | null; deliveredAt: Date | null }> {
    const existing = await this.prisma.shipment.findUnique({
      where: { orderId },
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        shippedAt: true,
        deliveredAt: true,
      },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.shipment.create({
      data: {
        orderId,
        method: SHIPPING_METHOD_CODES.includes(method as ShippingMethodCode)
          ? method
          : 'STORE_PICKUP',
        status: ShipmentStatus.PENDING,
      },
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        shippedAt: true,
        deliveredAt: true,
      },
    });
  }

  /** Forward-only shipment moves plus CANCELLED; terminal states reject. */
  private assertShipmentTransition(current: ShipmentStatus, next: ShipmentStatus): void {
    const legal: Record<ShipmentStatus, ShipmentStatus[]> = {
      [ShipmentStatus.PENDING]: [ShipmentStatus.PICKED_UP, ShipmentStatus.CANCELLED],
      [ShipmentStatus.PICKED_UP]: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.CANCELLED],
      [ShipmentStatus.IN_TRANSIT]: [ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.CANCELLED],
      [ShipmentStatus.OUT_FOR_DELIVERY]: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED],
      [ShipmentStatus.DELIVERED]: [],
      [ShipmentStatus.CANCELLED]: [],
    };
    if (!legal[current]?.includes(next)) {
      throw new ConflictException(
        `تغییر وضعیت ارسال از «${SHIPMENT_STATUS_FA[current]}» به «${SHIPMENT_STATUS_FA[next]}» مجاز نیست.`,
      );
    }
  }

  /**
   * SS-234 COD-only gate, shared by cart checkout and RFQ accept: reject
   * methods disabled by env before touching stock. ONLINE stays 422 until
   * the gateway ticket (SS-234B); COD flips to PAID only on the operator
   * DELIVERED transition (SS-240).
   */
  private assertPaymentEnabled(paymentMethod: PaymentMethod): void {
    if (paymentMethod === PaymentMethod.ONLINE && !isOnlinePaymentsEnabled()) {
      throw new UnprocessableEntityException(
        'پرداخت آنلاین در حال حاضر فعال نیست؛ لطفاً پرداخت در محل را انتخاب کنید.',
      );
    }
    if (paymentMethod === PaymentMethod.COD && !isCodEnabled()) {
      throw new UnprocessableEntityException(
        'پرداخت در محل در حال حاضر فعال نیست.',
      );
    }
  }

  /** Consume every reserved slice; a mid-flow failure unwinds and rethrows. */
  private async consumeAll(
    slices: AllocationSlice[],
    userId: string,
  ): Promise<void> {
    const consumed: AllocationSlice[] = [];
    try {
      for (const slice of slices) {
        await this.inventory.consumeReservation(slice.reservationId, userId);
        consumed.push(slice);
      }
    } catch (error) {
      await this.unwindSlices(userId, slices, consumed);
      throw error;
    }
  }

  private throwProblem(problem: CheckoutProblemDto): never {
    switch (problem.code) {
      case 'UNPUBLISHED':
        throw new NotFoundException(problem.message);
      case 'CALL_FOR_PRICE':
        throw new UnprocessableEntityException(problem.message);
      case 'OUT_OF_STOCK':
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: problem.message,
          available: problem.available ?? 0,
        });
      default:
        throw new BadRequestException(problem.message);
    }
  }

  private fulfillableLines(
    lines: CartLine[],
    summary: CheckoutSummaryDto,
  ): CartLine[] {
    const blockingIds = new Set(
      summary.problems
        .filter((problem) => this.isBlocking(problem.code))
        .map((problem) => problem.variantId),
    );
    return lines.filter((line) => !blockingIds.has(line.variantId));
  }

  /**
   * Reserve every fulfillable line slice-by-slice across warehouses
   * (largest availability first). A mid-flow shortage releases everything
   * reserved so far and rethrows the ledger's 409.
   */
  private async reserveAll(
    userId: string,
    fulfillable: QuotableLine[],
    unitPrices: Map<string, Prisma.Decimal>,
  ): Promise<AllocationSlice[]> {
    const slices: AllocationSlice[] = [];
    try {
      for (const line of fulfillable) {
        const holders = await this.prisma.inventoryItem.findMany({
          where: { variantId: line.variantId, ...activeInventoryWhere() },
          select: {
            warehouseId: true,
            quantityOnHand: true,
            quantityReserved: true,
          },
        });
        const ranked = holders
          .map((holder) => ({
            warehouseId: holder.warehouseId,
            available: deriveAvailable(
              holder.quantityOnHand,
              holder.quantityReserved,
            ),
          }))
          .filter((holder) => holder.available > 0)
          .sort((a, b) => b.available - a.available);
        let remaining = line.quantity;
        for (const holder of ranked) {
          if (remaining <= 0) {
            break;
          }
          const take = Math.min(remaining, holder.available);
          const reservation = await this.inventory.reserve(
            {
              variantId: line.variantId,
              warehouseId: holder.warehouseId,
              quantity: take,
            },
            userId,
          );
          slices.push({
            variantId: line.variantId,
            warehouseId: holder.warehouseId,
            quantity: take,
            unitPrice: unitPrices.get(line.variantId) ?? line.variant.price,
            productName: line.variant.product.name,
            variantName: line.variant.name,
            sku: line.variant.sku,
            reservationId: reservation.id,
          });
          remaining -= take;
        }
        if (remaining > 0) {
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: 'موجودی کافی برای ثبت سفارش در دسترس نیست.',
            available: line.quantity - remaining,
          });
        }
      }
      return slices;
    } catch (error) {
      for (const slice of slices) {
        try {
          await this.inventory.releaseReservation(slice.reservationId, userId);
        } catch (releaseError) {
          this.logger.warn(
            `Checkout reserve unwind failed reservation=${slice.reservationId}: ${releaseError}`,
          );
        }
      }
      throw error;
    }
  }

  /**
   * Unwind after a mid-consume failure: consumed slices are restocked,
   * still-ACTIVE slices released (all best-effort, original error wins).
   */
  private async unwindSlices(
    userId: string,
    slices: AllocationSlice[],
    consumed: AllocationSlice[],
  ): Promise<void> {
    const consumedIds = new Set(consumed.map((slice) => slice.reservationId));
    for (const slice of slices) {
      try {
        if (consumedIds.has(slice.reservationId)) {
          await this.inventory.receive(
            {
              variantId: slice.variantId,
              warehouseId: slice.warehouseId,
              quantity: slice.quantity,
              notes: 'order-failed:consume-unwind',
            },
            userId,
          );
        } else {
          await this.inventory.releaseReservation(slice.reservationId, userId);
        }
      } catch (unwindError) {
        this.logger.warn(
          `Checkout consume unwind failed reservation=${slice.reservationId}: ${unwindError}`,
        );
      }
    }
  }

  private async restockSlices(
    userId: string,
    slices: AllocationSlice[],
    note: string,
  ): Promise<void> {
    for (const slice of slices) {
      try {
        await this.inventory.receive(
          {
            variantId: slice.variantId,
            warehouseId: slice.warehouseId,
            quantity: slice.quantity,
            notes: note,
          },
          userId,
        );
      } catch (restockError) {
        this.logger.error(
          `Checkout restock FAILED variant=${slice.variantId} warehouse=${slice.warehouseId} qty=${slice.quantity}: ${restockError}`,
        );
      }
    }
  }

  private totalsFor(
    slices: AllocationSlice[],
    shippingFee: Prisma.Decimal = new Prisma.Decimal(0),
  ): {
    subtotal: Prisma.Decimal;
    total: Prisma.Decimal;
  } {
    let subtotal = new Prisma.Decimal(0);
    for (const slice of slices) {
      subtotal = subtotal.add(slice.unitPrice.mul(slice.quantity));
    }
    return { subtotal, total: subtotal.add(shippingFee) };
  }

  /** Global sequence draw (spec §7 unique + sequential); nextval is atomic. */
  private async nextOrderNumber(): Promise<number> {
    // nextval is bigint on the wire: cast to INT so pg returns a number.
    const rows = await this.prisma.$queryRaw<Array<{ n: number }>>`
      SELECT nextval('"sabz_order_number_seq"')::INT AS "n"
    `;
    const n = rows[0]?.n;
    if (typeof n !== 'number' || !Number.isInteger(n)) {
      throw new BadRequestException('صدور شماره سفارش ممکن نیست؛ دوباره تلاش کنید.');
    }
    return n;
  }

  private async availableFor(variantIds: string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.inventoryItem.findMany({
      where: { variantId: { in: variantIds }, ...activeInventoryWhere() },
      select: {
        variantId: true,
        quantityOnHand: true,
        quantityReserved: true,
      },
    });
    const totals = new Map<string, number>();
    for (const row of rows) {
      totals.set(
        row.variantId,
        (totals.get(row.variantId) ?? 0) +
          deriveAvailable(row.quantityOnHand, row.quantityReserved),
      );
    }
    return totals;
  }

  private toDetail(order: {
    id: string;
    orderNumber: number;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    paymentStatus: 'PENDING' | 'PAID' | 'FAILED';
    subtotal: Prisma.Decimal;
    shippingMethod: string;
    shippingFee: Prisma.Decimal;
    total: Prisma.Decimal;
    fullName: string;
    phone: string;
    province: string | null;
    city: string | null;
    address: string;
    postalCode: string | null;
    createdAt: Date;
    shipment: {
      id: string;
      orderId: string;
      method: string;
      trackingNumber: string | null;
      status: ShipmentStatus;
      shippedAt: Date | null;
      deliveredAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      events: Array<{
        id: string;
        status: ShipmentStatus;
        location: string | null;
        note: string | null;
        createdAt: Date;
      }>;
    } | null;
    items: Array<{
      id: string;
      variantId: string;
      productName: string;
      variantName: string | null;
      sku: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>;
  }): OrderDetailDto {
    const addressSnapshot: OrderAddressSnapshot = {
      fullName: order.fullName,
      phone: order.phone,
      province: order.province,
      city: order.city,
      address: order.address,
      postalCode: order.postalCode,
    };
    const items: OrderItemDto[] = order.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      lineTotal: item.lineTotal.toString(),
    }));
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status as OrderDetailDto['status'],
      statusFa: ORDER_STATUS_FA[order.status as keyof typeof ORDER_STATUS_FA],
      paymentMethod: order.paymentMethod as OrderDetailDto['paymentMethod'],
      paymentStatus: order.paymentStatus as OrderDetailDto['paymentStatus'],
      subtotal: order.subtotal.toString(),
      shippingMethod: order.shippingMethod as OrderDetailDto['shippingMethod'],
      shippingFee: order.shippingFee.toString(),
      total: order.total.toString(),
      shipment: order.shipment ? this.toShipmentDto(order.shipment) : null,
      addressSnapshot,
      items,
      createdAt: order.createdAt.toISOString(),
    };
  }

  /** Maps a shipment row + its events to the SS-241 DTO (oldest event first). */
  private toShipmentDto(shipment: {
    id: string;
    orderId: string;
    method: string;
    trackingNumber: string | null;
    status: ShipmentStatus;
    shippedAt: Date | null;
    deliveredAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    events: Array<{
      id: string;
      status: ShipmentStatus;
      location: string | null;
      note: string | null;
      createdAt: Date;
    }>;
  }): ShipmentDto {
    const method = shipment.method as ShipmentDto['method'];
    const status = shipment.status as ShipmentDto['status'];
    const events: TrackingEventDto[] = shipment.events.map((event) => {
      const eventStatus = event.status as TrackingEventDto['status'];
      return {
        id: event.id,
        status: eventStatus,
        statusFa: SHIPMENT_STATUS_FA[eventStatus],
        location: event.location,
        note: event.note,
        createdAt: event.createdAt.toISOString(),
      };
    });
    return {
      id: shipment.id,
      orderId: shipment.orderId,
      method,
      methodFa: SHIPPING_METHOD_FA[method] ?? method,
      trackingNumber: shipment.trackingNumber,
      status,
      statusFa: SHIPMENT_STATUS_FA[status],
      shippedAt: shipment.shippedAt?.toISOString() ?? null,
      deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
      events,
    };
  }
}
