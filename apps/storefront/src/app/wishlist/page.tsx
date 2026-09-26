import type { Metadata } from 'next';
import { WishlistGrid } from './wishlist-grid';

export const metadata: Metadata = { title: 'علاقه‌مندی‌ها' };

/** Server wrapper (SS-231): metadata lives here, interactivity in the grid. */
export default function WishlistPage() {
  return <WishlistGrid />;
}
