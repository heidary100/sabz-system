import type { CatalogProductCardDto } from '@sabz/types';
import { ProductCard } from '@/components/ecommerce/product-card/product-card';
import { AddToCartButton } from '@/components/ecommerce/cart/add-to-cart-button';
import { salePercentFrom } from '@/lib/format';
import { WishlistHeart } from './wishlist-heart';

/**
 * Product card with commerce overlays (SS-231 heart, SS-232 quick-add).
 *
 * Both overlays are siblings of the card link — never nested inside it
 * (SS-218: no nested interactive elements). The heart dodges the sale badge
 * (top/end); the quick-add sits at bottom/end, clear of the out-of-stock
 * pill (top/start). Quick-add renders only for purchasable cards (in stock,
 * priced) and resolves the default variant server-side — never for
 * call-for-price or out-of-stock rows.
 */
export function ProductCardWithWishlist({
  product,
}: {
  product: CatalogProductCardDto;
}) {
  const hasSaleBadge =
    salePercentFrom(product.priceFrom, product.compareAtPrice) !== null;
  const purchasable = product.inStock && !product.callForPrice;

  return (
    <div className="relative">
      <ProductCard product={product} />
      <div className={`absolute end-2 ${hasSaleBadge ? 'top-12' : 'top-2'}`}>
        <WishlistHeart productId={product.id} />
      </div>
      {purchasable ? (
        <div className="absolute bottom-2 end-2">
          <AddToCartButton
            size="icon"
            identity={{ productId: product.id }}
            productName={product.name}
          />
        </div>
      ) : null}
    </div>
  );
}
