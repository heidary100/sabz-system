import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PriceStatus, Prisma, ProductMediaType, ProductStatus } from '@prisma/client';
import type {
  CartItemDto,
  CartResponse,
  ClearCartResponse,
  RemoveCartItemResponse,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { hasActiveProductSale } from '../../common/money/discount';
import { roundRialUp } from '../../common/money/rial';
import {
  activeInventoryWhere,
  deriveAvailable,
} from '../inventory/inventory-aggregate';
import { PricingService } from '../pricing/pricing.service';
import { publicMediaAssetUrl } from '../products/media-public-url';

const LINE_WITH_VARIANT = {
  id: true,
  quantity: true,
  unitPriceAtAdd: true,
  createdAt: true,
  variantId: true,
  variant: {
    select: {
      sku: true,
      name: true,
      price: true,
      discountedPrice: true,
      discountStartsAt: true,
      discountEndsAt: true,
      partnerPrice: true,
      priceStatus: true,
      deletedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          deletedAt: true,
          categoryId: true,
          brandId: true,
        },
      },
    },
  },
} as const;

type LineWithVariant = Prisma.CartItemGetPayload<{ select: typeof LINE_WITH_VARIANT }>;

/**
 * Customer shopping cart (SS-232): one cart per authenticated user, lines
 * keyed by variant.
 *
 * Listing truth (price/visibility/media) is read from the same Prisma rows
 * the public catalog projects, and stock uses the exact SS-112 operational
 * predicate (`activeInventoryWhere` + `deriveAvailable`), so cart state can
 * never drift from catalog truth. Prices are Rial verbatim (SS-207 "O-1"):
 * `unitPrice` is the SS-235 server-resolved price (retail base → partner
 * tier → bulk → scheduled promotion) and the only line truth (CART-003),
 * while `unitPriceAtAdd` is the add-time snapshot kept for display.
 * Nothing is reserved here — inventory is reserved only at checkout
 * (CART-005, SS-233).
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async list(userId: string): Promise<CartResponse> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!cart) {
      return { items: [], totalQuantity: 0, subtotal: '0' };
    }
    return this.hydrate(cart.id, userId);
  }

  async add(
    userId: string,
    input: { variantId?: string; productId?: string },
    quantity: number,
  ): Promise<{ item: CartItemDto; created: boolean }> {
    // Exactly one identity: a concrete variant, or a product to quick-add
    // (resolved to its default purchasable variant below).
    const variantId =
      input.variantId ?? (await this.resolveDefaultVariant(input.productId));
    const variant = await this.requirePurchasable(variantId);
    const available = await this.availableForOne(variantId);
    const cart = await this.getOrCreateCart(userId);

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      select: { id: true, quantity: true },
    });
    // Add semantics: increment the existing line (standard cart behavior).
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    if (nextQuantity > available) {
      this.insufficientStock(available);
    }

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: nextQuantity },
      });
      return {
        item: await this.rebaselineLine(cart.id, variantId, userId),
        created: false,
      };
    }

    try {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId,
          quantity,
          // The add-time baseline must be the SAME authoritative resolved
          // unit the customer is shown (tier/bulk/category/promotion chain),
          // not a simplified variant-price estimate. Rebaselined below once
          // the full pricing context is loaded.
          unitPriceAtAdd: roundRialUp(
            hasActiveProductSale({
              price: variant.price,
              discountedPrice: variant.discountedPrice,
              discountStartsAt: variant.discountStartsAt,
              discountEndsAt: variant.discountEndsAt,
            })
              ? variant.discountedPrice
              : variant.price,
          ),
        },
      });
      return {
        item: await this.rebaselineLine(cart.id, variantId, userId),
        created: true,
      };
    } catch {
      // Lost a concurrent-insert race (unique [cartId, variantId]): the line
      // exists now, so increment it instead of a 500.
      const raced = await this.prisma.cartItem.findUniqueOrThrow({
        where: { cartId_variantId: { cartId: cart.id, variantId } },
        select: { id: true, quantity: true },
      });
      const racedQuantity = raced.quantity + quantity;
      if (racedQuantity > available) {
        this.insufficientStock(available);
      }
      await this.prisma.cartItem.update({
        where: { id: raced.id },
        data: { quantity: racedQuantity },
      });
      return {
        item: await this.rebaselineLine(cart.id, variantId, userId),
        created: false,
      };
    }
  }

  async setQuantity(
    userId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartItemDto> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: { id: true },
    });
    const line = cart
      ? await this.prisma.cartItem.findUnique({
          where: { cartId_variantId: { cartId: cart.id, variantId } },
          select: { id: true },
        })
      : null;
    if (!cart || !line) {
      throw new NotFoundException('این محصول در سبد خرید نیست.');
    }
    // Re-validated: the variant may have become unpublished or
    // call-for-price after it was added.
    await this.requirePurchasable(variantId);
    const available = await this.availableForOne(variantId);
    if (quantity > available) {
      this.insufficientStock(available);
    }
    await this.prisma.cartItem.update({
      where: { id: line.id },
      data: { quantity },
    });
    // Quantity is part of the pricing context (bulk tiers). The customer
    // just chose this quantity, so the new effective unit is the accepted
    // baseline; otherwise a bulk-tier change would look like a price drift.
    return this.rebaselineLine(cart.id, variantId, userId);
  }

  /**
   * Explicitly accepts the current authoritative price for every cart line,
   * clearing genuine change warnings until the next external price change.
   * The server resolves the values; the client never supplies prices.
   */
  async acknowledgePrices(userId: string): Promise<CartResponse> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!cart) {
      return { items: [], totalQuantity: 0, subtotal: '0' };
    }
    const current = await this.hydrate(cart.id, userId);
    for (const item of current.items) {
      await this.prisma.cartItem.update({
        where: {
          cartId_variantId: { cartId: cart.id, variantId: item.variantId },
        },
        data: { unitPriceAtAdd: new Prisma.Decimal(item.unitPrice) },
      });
    }
    // Re-read so totals and flags are computed from the persisted baseline.
    return this.hydrate(cart.id, userId);
  }

  /**
   * Recomputes a line's authoritative unit and stores it as the accepted
   * add-time baseline. Used when the customer creates a line, increases its
   * quantity, or explicitly acknowledges a new price.
   */
  private async rebaselineLine(
    cartId: string,
    variantId: string,
    userId: string,
  ): Promise<CartItemDto> {
    const item = await this.hydrateSingle(cartId, variantId, userId);
    await this.prisma.cartItem.update({
      where: { cartId_variantId: { cartId, variantId } },
      data: { unitPriceAtAdd: new Prisma.Decimal(item.unitPrice) },
    });
    return {
      ...item,
      unitPriceAtAdd: item.unitPrice,
      priceChanged: false,
    };
  }

  async remove(userId: string, variantId: string): Promise<RemoveCartItemResponse> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!cart) {
      return { removed: false };
    }
    const deleted = await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id, variantId },
    });
    return { removed: deleted.count > 0 };
  }

  async clear(userId: string): Promise<ClearCartResponse> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (cart) {
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
    return { cleared: true };
  }

  private async getOrCreateCart(userId: string): Promise<{ id: string }> {
    const existing = await this.prisma.cart.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.cart.create({
        data: { userId },
        select: { id: true },
      });
    } catch {
      // Lost a concurrent-create race (unique userId): the cart exists now.
      return this.prisma.cart.findUniqueOrThrow({
        where: { userId },
        select: { id: true },
      });
    }
  }

  /**
   * Quick-add resolution (SS-232 card slot): a product maps to its default
   * purchasable variant — the first in-stock PRICED variant in catalog order
   * (createdAt, id), mirroring the storefront `defaultVariantId` preference
   * for purchasable stock without duplicating its URL-state rules.
   */
  private async resolveDefaultVariant(
    productId: string | undefined,
  ): Promise<string> {
    if (!productId) {
      throw new BadRequestException('variantId یا productId الزامی است.');
    }
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, status: ProductStatus.PUBLISHED },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('محصول یافت نشد.');
    }
    const variants = await this.prisma.productVariant.findMany({
      where: {
        productId: product.id,
        deletedAt: null,
        priceStatus: PriceStatus.PRICED,
      },
      select: { id: true },
      orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    });
    if (variants.length === 0) {
      throw new UnprocessableEntityException(
        'این محصول قابل خرید اینترنتی نیست؛ برای استعلام قیمت با فروشگاه در تماس باشید.',
      );
    }
    const availableByVariant = await this.availableFor(
      variants.map((row) => row.id),
    );
    const pick = variants.find(
      (row) => (availableByVariant.get(row.id) ?? 0) > 0,
    );
    if (!pick) {
      this.insufficientStock(0);
    }
    return pick.id;
  }

  /**
   * The variant must be live and purchasable: not soft-deleted, owning
   * product PUBLISHED and non-deleted (the wishlist visibility predicate),
   * and PRICED (CALL_FOR_PRICE rows are published but non-purchasable).
   */
  private async requirePurchasable(variantId: string): Promise<{
    price: Prisma.Decimal;
    discountedPrice: Prisma.Decimal | null;
    discountStartsAt: Date | null;
    discountEndsAt: Date | null;
  }> {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        deletedAt: null,
        product: { deletedAt: null, status: ProductStatus.PUBLISHED },
      },
      select: {
        price: true,
        discountedPrice: true,
        discountStartsAt: true,
        discountEndsAt: true,
        priceStatus: true,
      },
    });
    if (!variant) {
      throw new NotFoundException('محصول یافت نشد.');
    }
    if (variant.priceStatus !== PriceStatus.PRICED) {
      throw new UnprocessableEntityException(
        'این مدل قابل خرید اینترنتی نیست؛ برای استعلام قیمت با فروشگاه در تماس باشید.',
      );
    }
    return variant;
  }

  private async availableForOne(variantId: string): Promise<number> {
    return (await this.availableFor([variantId])).get(variantId) ?? 0;
  }

  /** Available (onHand − reserved) per variant under the SS-112 predicate. */
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

  /** Primary product-level image per product (card pipeline ordering). */
  private async primaryImageByProduct(
    productIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(productIds)];
    if (unique.length === 0) {
      return new Map();
    }
    const media = await this.prisma.productMedia.findMany({
      where: {
        productId: { in: unique },
        deletedAt: null,
        mediaType: ProductMediaType.IMAGE,
        // Pending import placeholders have no binary; never render them as a
        // cart image while the media stage is incomplete.
        NOT: { storageKey: { startsWith: 'pending-woo' } },
      },
      select: {
        id: true,
        productId: true,
        storageKey: true,
        isPrimary: true,
        sortOrder: true,
        createdAt: true,
      },
    });
    const best = new Map<
      string,
      {
        id: string;
        storageKey: string;
        isPrimary: boolean;
        sortOrder: number;
        createdAt: Date;
      }
    >();
    for (const row of media) {
      const current = best.get(row.productId);
      if (
        !current ||
        (row.isPrimary && !current.isPrimary) ||
        (row.isPrimary === current.isPrimary &&
          (row.sortOrder < current.sortOrder ||
            (row.sortOrder === current.sortOrder &&
              row.createdAt < current.createdAt)))
      ) {
        best.set(row.productId, row);
      }
    }
    const urls = new Map<string, string>();
    for (const [productId, row] of best) {
      urls.set(productId, publicMediaAssetUrl(row.id, row.storageKey));
    }
    return urls;
  }

  private async hydrate(cartId: string, userId: string): Promise<CartResponse> {
    const lines = await this.prisma.cartItem.findMany({
      where: { cartId },
      orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      select: LINE_WITH_VARIANT,
    });
    const visible = lines.filter(
      (line) =>
        line.variant.deletedAt === null &&
        line.variant.product.deletedAt === null &&
        line.variant.product.status === ProductStatus.PUBLISHED,
    );
    if (visible.length === 0) {
      return { items: [], totalQuantity: 0, subtotal: '0' };
    }
    const availableByVariant = await this.availableFor(
      visible.map((line) => line.variantId),
    );
    const imageByProduct = await this.primaryImageByProduct(
      visible.map((line) => line.variant.product.id),
    );
    // One partner lookup per hydration; promotions resolve per line.
    const partner = await this.pricing.partnerPricingForUser(userId);
    const items = await Promise.all(
      visible.map((line) =>
        this.toDto(line, availableByVariant, imageByProduct, partner),
      ),
    );
    let subtotal = new Prisma.Decimal(0);
    let totalQuantity = 0;
    for (const item of items) {
      subtotal = subtotal.add(item.lineTotal);
      totalQuantity += item.quantity;
    }
    return { items, totalQuantity, subtotal: subtotal.toString() };
  }

  private async hydrateSingle(
    cartId: string,
    variantId: string,
    userId: string,
  ): Promise<CartItemDto> {
    const line = await this.prisma.cartItem.findUniqueOrThrow({
      where: { cartId_variantId: { cartId, variantId } },
      select: LINE_WITH_VARIANT,
    });
    const availableByVariant = await this.availableFor([variantId]);
    const imageByProduct = await this.primaryImageByProduct([
      line.variant.product.id,
    ]);
    const partner = await this.pricing.partnerPricingForUser(userId);
    return this.toDto(line, availableByVariant, imageByProduct, partner);
  }

  private async toDto(
    line: LineWithVariant,
    availableByVariant: Map<string, number>,
    imageByProduct: Map<string, string>,
    partner: { tierPercent: Prisma.Decimal; eligible: boolean },
  ): Promise<CartItemDto> {
    // SS-235: the line truth is the server-resolved price, never the raw
    // variant price and never anything the client sends (CART-004).
    // B1 chain: category rule → override → tier → bulk → promotion.
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
    const unitPrice = PricingService.resolveLine(
      line.variant.price,
      line.quantity,
      partner.tierPercent,
      promotions,
      { categoryRule, override },
      {
        regularPrice: line.variant.price,
        discountedPrice: line.variant.discountedPrice,
        discountStartsAt: line.variant.discountStartsAt,
        discountEndsAt: line.variant.discountEndsAt,
        partnerPrice: line.variant.partnerPrice,
        partnerEligible: partner.eligible,
      },
    ).toString();
    const unitPriceAtAdd = line.unitPriceAtAdd.toString();
    // Decimal-aware comparison: equal monetary values in different string
    // representations ("100000" vs "100000.00") are NOT a price change.
    const priceChanged = !new Prisma.Decimal(unitPrice).equals(
      line.unitPriceAtAdd,
    );
    const available = availableByVariant.get(line.variantId) ?? 0;
    return {
      variantId: line.variantId,
      productId: line.variant.product.id,
      productSlug: line.variant.product.slug,
      productName: line.variant.product.name,
      variantSku: line.variant.sku,
      variantName: line.variant.name,
      quantity: line.quantity,
      unitPrice,
      unitPriceAtAdd,
      lineTotal: new Prisma.Decimal(unitPrice).mul(line.quantity).toString(),
      priceChanged,
      priceStatus: line.variant.priceStatus,
      available,
      inStock: available > 0,
      primaryImageUrl: imageByProduct.get(line.variant.product.id) ?? null,
      addedAt: line.createdAt.toISOString(),
    };
  }

  /** Over-stock (including restocked-to-zero): always reject, never clamp. */
  private insufficientStock(available: number): never {
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
}
