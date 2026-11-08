import Link from 'next/link';
import type { CatalogProductCardDto } from '@sabz/types';
import {
  ProductCard,
  type ProductCardDensity,
} from '@/components/ecommerce/product-card/product-card';
import { AddToCartButton } from '@/components/ecommerce/cart/add-to-cart-button';
import { CompareToggle } from '@/components/ecommerce/compare/compare-toggle';
import { WishlistHeart } from './wishlist-heart';

/**
 * Product card with commerce actions (Task 02).
 *
 * The product anchor owns only image/information/price. Wishlist sits in the
 * media corner; quote, quick-add, unavailable and compare controls live in a
 * dedicated footer row outside that anchor. No interactive element is nested
 * in another, and the price can never be covered by a control.
 *
 * Quick-add renders only for genuinely purchasable cards (in stock, priced).
 * Call-for-price cards expose an intentional «استعلام قیمت» route instead of
 * a muted placeholder. Out-of-stock priced cards show their real price and a
 * non-interactive unavailable state.
 */
export function ProductCardWithWishlist({
  product,
  density = 'default',
}: {
  product: CatalogProductCardDto;
  density?: ProductCardDensity;
}) {
  const purchasable = product.inStock && !product.callForPrice;

  return (
    <ProductCard
      product={product}
      density={density}
      corner={<WishlistHeart productId={product.id} />}
      footer={
        <div className="flex items-center gap-2">
          {product.callForPrice ? (
            <Link
              href={`/products/${product.slug}`}
              className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-accent/40 bg-accent-soft px-1.5 text-[11px] font-semibold text-accent transition-colors sm:px-2 sm:text-xs hover:border-accent hover:bg-accent hover:text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              استعلام قیمت
            </Link>
          ) : purchasable ? (
            <AddToCartButton
              size="card"
              identity={{ productId: product.id }}
              productName={product.name}
            />
          ) : (
            <span className="flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-control border border-border bg-surface-2 px-2 text-xs font-semibold text-fg-muted">
              ناموجود
            </span>
          )}

          <CompareToggle
            productId={product.id}
            slug={product.slug}
            productName={product.name}
            className="shrink-0"
          />
        </div>
      }
    />
  );
}
