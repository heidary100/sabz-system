import type { CatalogProductCardDto } from '@sabz/types';
import { ProductCard } from '@/components/ecommerce/product-card/product-card';

/**
 * Related-products rail (SS-214, server). Renders the API-provided
 * `related[]` with the listing `ProductCard` in a responsive grid — no
 * client fetch, no recommendation logic. Empty sets omit the section.
 */
export function RelatedProducts({
  items = [],
}: {
  items?: CatalogProductCardDto[];
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="related-heading" className="mt-14">
      <h2
        id="related-heading"
        className="text-xl font-bold tracking-tight text-ink-900"
      >
        محصولات مرتبط
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
