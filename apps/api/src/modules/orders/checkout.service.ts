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
} from '@prisma/client';
import type {
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
  ShippingMethodDto,
} from '@sabz/types';
import { ORDER_STATUS_FA } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import {
  activeInventoryWhere,
  deriveAvailable,
} from '../inventory/inventory-aggregate';
import { InventoryService } from '../inventory/inventory.service';
import { PricingService } from '../pricing/pricing.service';

/**
 * Static v1 choice lists. Shipping fees are "0" (Rial) — real carrier fees
 * arrive with SS-241. Payments are COD-only (SS-234): ONLINE stays listed
 * but disabled until the gateway ticket (SS-234B) flips
 * `PAYMENTS_ONLINE_ENABLED=true` with verified credentials. Both lists are
 * honest stubs, never fake integrations.
 */
const SHIPPING_METHODS: ShippingMethodDto[] = [
  { code: 'TIPAX', titleFa: 'تیپاکس', etaFa: '۲ تا ۴ روز کاری', fee: '0' },
  { code: 'IRAN_POST', titleFa: 'پست ایران', etaFa: '۳ تا ۷ روز کاری', fee: '0' },
  { code: 'LOCAL_DELIVERY', titleFa: 'ارسال درون‌شهری ساری', etaFa: '۱ تا ۲ روز کاری', fee: '0' },
  { code: 'STORE_PICKUP', titleFa: 'تحویل حضوری از فروشگاه', etaFa: 'پس از هماهنگی', fee: '0' },
];

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
  ) {}

  shippingMethods(): { items: ShippingMethodDto[] } {
    return { items: SHIPPING_METHODS };
  }

  paymentMethods(): { items: PaymentMethodDto[] } {
    return { items: buildPaymentMethods() };
  }

  async validate(
    userId: string,
    addressId?: string,
  ): Promise<CheckoutSummaryDto> {
    if (addressId !== undefined) {
      await this.requireOwnAddress(userId, addressId);
    }
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
    return (await this.summarize(userId, lines)).summary;
  }

  async placeOrder(
    userId: string,
    addressId: string,
    paymentMethod: PaymentMethod,
  ): Promise<PlaceOrderResult> {
    this.assertPaymentEnabled(paymentMethod);
    const address = await this.requireOwnAddress(userId, addressId);
    const lines = await this.cartLines(userId);
    if (lines.length === 0) {
      throw new BadRequestException('سبد خرید خالی است.');
    }
    const { summary, unitPrices } = await this.summarize(userId, lines);
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
    const totals = this.totalsFor(slices);
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
            shippingFee: new Prisma.Decimal(0),
            total: totals.total,
            fullName: address.fullName,
            phone: address.phone,
            province: address.province,
            city: address.city,
            address: address.address,
            postalCode: address.postalCode,
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
    const totals = this.totalsFor(slices);
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
            shippingFee: new Prisma.Decimal(0),
            total: totals.total,
            fullName: address.fullName,
            phone: address.phone,
            province: address.province,
            city: address.city,
            address: address.address,
            postalCode: address.postalCode,
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
        shippingFee: true,
        total: true,
        fullName: true,
        phone: true,
        province: true,
        city: true,
        address: true,
        postalCode: true,
        createdAt: true,
        items: {
          select: {
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

  async cancelOrder(userId: string, orderId: string): Promise<OrderDetailDto> {
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
        shippingFee: '0',
        total: subtotal.toString(),
        problems,
      },
      unitPrices,
    };
  }

  private isBlocking(code: CheckoutProblemCode): boolean {
    return code === 'OUT_OF_STOCK' || code === 'UNPUBLISHED' || code === 'CALL_FOR_PRICE';
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

  private totalsFor(slices: AllocationSlice[]): {
    subtotal: Prisma.Decimal;
    total: Prisma.Decimal;
  } {
    let subtotal = new Prisma.Decimal(0);
    for (const slice of slices) {
      subtotal = subtotal.add(slice.unitPrice.mul(slice.quantity));
    }
    return { subtotal, total: subtotal };
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
    shippingFee: Prisma.Decimal;
    total: Prisma.Decimal;
    fullName: string;
    phone: string;
    province: string | null;
    city: string | null;
    address: string;
    postalCode: string | null;
    createdAt: Date;
    items: Array<{
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
      shippingFee: order.shippingFee.toString(),
      total: order.total.toString(),
      addressSnapshot,
      items,
      createdAt: order.createdAt.toISOString(),
    };
  }
}
