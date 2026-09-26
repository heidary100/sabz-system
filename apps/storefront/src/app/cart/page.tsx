import type { Metadata } from 'next';
import { CartPageContent } from './cart-page-content';

export const metadata: Metadata = { title: 'سبد خرید' };

/** Server wrapper (SS-232): metadata lives here, interactivity in the island. */
export default function CartPage() {
  return <CartPageContent />;
}
