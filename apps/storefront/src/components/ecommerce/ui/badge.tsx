import type { HTMLAttributes } from 'react';

/**
 * Shared badge primitive (SS-221, tokenized Task 01): the single source for
 * the storefront's status/metadata chips — discount, stock truth,
 * call-for-price, condition. Badges are never interactive; for a chip-shaped
 * LINK reuse `badgeVariants()` on the anchor and add its own hover styles.
 */

export type BadgeVariant =
  | 'sale'
  | 'outOfStock'
  | 'callForPrice'
  | 'condition'
  | 'success'
  | 'neutral';

const BASE =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2.5 py-0.5 text-[11px] font-medium';

const VARIANTS: Record<BadgeVariant, string> = {
  /** Discount percentage (e.g. ٪۱۲−), on top of product imagery. */
  sale: 'bg-sale text-on-sale',
  /** Stock truth must never rely on color alone — always paired with text. */
  outOfStock: 'bg-stage/90 text-on-stage',
  callForPrice: 'bg-surface-2 text-fg-secondary ring-1 ring-inset ring-border',
  condition: 'bg-surface-2 text-fg-secondary ring-1 ring-inset ring-border',
  success: 'bg-success-soft font-semibold text-success ring-1 ring-inset ring-success/30',
  neutral: 'bg-surface-2 text-fg-secondary ring-1 ring-inset ring-border',
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
