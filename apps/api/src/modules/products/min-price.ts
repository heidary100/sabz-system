import { PriceStatus, Prisma } from '@prisma/client';
import { hasActiveProductSale } from '../../common/money/discount';

/**
 * Denormalized minimum price maintenance (SS-217, updated for the product
 * pricing-grid spec).
 *
 * `Product.minPrice` = MIN(customer-facing selling price) over the product's
 * live (deletedAt IS NULL) variants whose priceStatus is PRICED. The selling
 * price is the active product sale price when its window contains `now`,
 * otherwise the regular price. This keeps listing cards, price sorts and the
 * SS-216 search SQL aligned with the detail/price APIs.
 *
 * NOTE: scheduled sales that start/end without a variant write still need a
 * read-time price projection (cards and detail do that); `minPrice` is a
 * denormalized index value recomputed on every variant write and by the FX
 * recalculation batch. The storefront card projection recomputes from
 * variants so a future/expired sale is never displayed.
 *
 * Every variant write path must call the recompute inside ITS OWN
 * transaction. Recomputation is always from the source-of-truth variants
 * (aggregate), never incremental arithmetic, so any interleaving of writes
 * converges on the correct value.
 */
export async function recomputeProductMinPrice(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<void> {
  // Serialize concurrent recomputes per product: two transactions mutating
  // variants of the same product lock the product row in a deterministic
  // place, so the second one's aggregate (READ COMMITTED) sees the first
  // one's committed variant state before overwriting the column.
  await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;

  const variants = await tx.productVariant.findMany({
    where: {
      productId,
      deletedAt: null,
      priceStatus: PriceStatus.PRICED,
    },
    select: {
      price: true,
      discountedPrice: true,
      discountStartsAt: true,
      discountEndsAt: true,
    },
  });

  const now = new Date();
  let min: Prisma.Decimal | null = null;
  for (const variant of variants) {
    const selling = hasActiveProductSale(
      {
        price: variant.price,
        discountedPrice: variant.discountedPrice,
        discountStartsAt: variant.discountStartsAt,
        discountEndsAt: variant.discountEndsAt,
      },
      now,
    )
      ? variant.discountedPrice!
      : variant.price;
    if (min === null || selling.lessThan(min)) {
      min = selling;
    }
  }

  await tx.product.update({
    where: { id: productId },
    data: { minPrice: min },
  });
}

/**
 * Batched recompute for paths that mutate many variants across products
 * (Woo importer, FX recalculation). Deduplicates and sorts ids so, with the
 * per-product row lock, lock ordering is deterministic and deadlock-free.
 * Still one query per product — once per affected product, never once per
 * variant.
 */
export async function recomputeProductsMinPrice(
  tx: Prisma.TransactionClient,
  productIds: string[],
): Promise<void> {
  for (const productId of [...new Set(productIds)].sort()) {
    await recomputeProductMinPrice(tx, productId);
  }
}
