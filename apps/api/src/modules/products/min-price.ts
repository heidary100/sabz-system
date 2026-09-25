import { PriceStatus, Prisma } from '@prisma/client';

/**
 * SS-217 denormalized minimum price maintenance.
 *
 * `Product.minPrice` = MIN(price) over the product's live (deletedAt IS NULL)
 * variants whose priceStatus is PRICED — the exact semantic of the public
 * catalog contract (listing sort, card `priceFrom`/`callForPrice`, and the
 * SS-216 search SQL). compareAtPrice never contributes: it is a static
 * reference price, not the effective price.
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

  const aggregate = await tx.productVariant.aggregate({
    where: {
      productId,
      deletedAt: null,
      priceStatus: PriceStatus.PRICED,
    },
    _min: { price: true },
  });

  await tx.product.update({
    where: { id: productId },
    data: { minPrice: aggregate._min.price },
  });
}

/**
 * Batched recompute for paths that mutate many variants across products
 * (Woo importer). Deduplicates and sorts ids so, with the per-product row
 * lock, lock ordering is deterministic and deadlock-free. Still one
 * aggregate per product — once per affected product, never once per variant.
 */
export async function recomputeProductsMinPrice(
  tx: Prisma.TransactionClient,
  productIds: string[],
): Promise<void> {
  for (const productId of [...new Set(productIds)].sort()) {
    await recomputeProductMinPrice(tx, productId);
  }
}
