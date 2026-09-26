import type { CatalogProductCardDto } from '@sabz/types';
import { ProductCard } from '@/components/ecommerce/product-card/product-card';
import { salePercentFrom } from '@/lib/format';
import { WishlistHeart } from './wishlist-heart';

/**
 * Product card with a wishlist heart overlay (SS-231).
 *
 * The heart is a sibling of the card link — never nested inside it (SS-218:
 * no nested interactive elements). Placement dodges the card's own badges:
 * the sale pill sits at top/end, so on-sale cards drop the heart below it;
 * the out-of-stock pill sits at top/start and never collides.
 */
export function ProductCardWithWishlist({
  product,
}: {
  product: CatalogProductCardDto;
}) {
  const hasSaleBadge =
    salePercentFrom(product.priceFrom, product.compareAtPrice) !== null;

  return (
    <div className="relative">
      <ProductCard product={product} />
      <div className={`absolute end-2 ${hasSaleBadge ? 'top-12' : 'top-2'}`}>
        <WishlistHeart productId={product.id} />
      </div>
    </div>
  );
}
