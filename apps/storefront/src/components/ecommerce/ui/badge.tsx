import type { HTMLAttributes } from 'react';

/**
 * Shared badge primitive (SS-221): the single source for the storefront's
 * status/metadata chips — discount, stock truth, call-for-price, condition.
 * Badges are never interactive; for a chip-shaped LINK reuse `badgeVariants()`
 * on the anchor and add its own hover styles.
 */

export type BadgeVariant =
  | 'sale'
  | 'outOfStock'
  | 'callForPrice'
  | 'condition'
  | 'success'
  | 'neutral';

const BASE =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium';

const VARIANTS: Record<BadgeVariant, string> = {
  /** Discount percentage (e.g. ٪۱۲−), on top of product imagery. */
  sale: 'bg-gradient-to-b from-red-500 to-red-600 text-white shadow-sm',
  /** Stock truth must never rely on color alone — always paired with text. */
  outOfStock: 'bg-ink-950/85 text-white backdrop-blur-sm',
  callForPrice: 'bg-sand-100 text-gray-600 ring-1 ring-inset ring-sand-200',
  condition: 'bg-sand-100 text-gray-600 ring-1 ring-inset ring-sand-200',
  success: 'bg-sabz-50 font-semibold text-sabz-700 ring-1 ring-inset ring-sabz-200',
  neutral: 'bg-sand-100 text-gray-600 ring-1 ring-inset ring-sand-200',
};

export function badgeVariants({
  variant = 'neutral',
}: {
  variant?: BadgeVariant;
} = {}): string {
  return `${BASE} ${VARIANTS[variant]}`;
}

export function Badge({
  variant = 'neutral',
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span className={`${badgeVariants({ variant })} ${className}`} {...props}>
      {children}
    </span>
  );
}
