import type { ButtonHTMLAttributes } from 'react';

/**
 * Shared button primitive (SS-221): the single source for the storefront's
 * action styling — variants × sizes on the Sabz palette, RTL-safe, with the
 * ≥44px touch target already enforced by the `md`/`lg` sizes. Visual only:
 * focus rings come from the global rule in globals.css (SS-218).
 *
 * For link-styled actions, reuse `buttonVariants()` on a `<Link>` —
 * Next.js prefetching means routed CTAs should stay links, not buttons.
 */

export type ButtonVariant = 'primary' | 'dark' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-sabz-700 text-white shadow-sm hover:bg-sabz-800',
  dark: 'bg-ink-950 text-white hover:bg-ink-900',
  outline:
    'border border-sand-200 bg-white text-ink-900 hover:border-sabz-300 hover:bg-sabz-50 hover:text-sabz-800',
  ghost: 'text-sabz-700 hover:bg-sabz-50 hover:text-sabz-800',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-xs',
  md: 'min-h-11 px-5 text-sm',
  lg: 'min-h-12 px-6 text-base',
};

export function buttonVariants({
  variant = 'primary',
  size = 'md',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} = {}): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

export function Button({
  variant,
  size,
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={`${buttonVariants({ variant, size })} ${className}`}
      {...props}
    />
  );
}
