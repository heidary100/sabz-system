import type { ButtonHTMLAttributes } from 'react';

/**
 * Shared button primitive (SS-221, tokenized Task 01): the single source for
 * the storefront's action styling — variants × sizes on semantic tokens,
 * RTL-safe, with the ≥44px touch target already enforced by `md`/`lg`.
 * Visual only: focus rings come from the global rule in globals.css.
 *
 * For link-styled actions, reuse `buttonVariants()` on a `<Link>` —
 * Next.js prefetching means routed CTAs should stay links, not buttons.
 */

export type ButtonVariant = 'primary' | 'dark' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition duration-200 ease-[var(--ease-swift)] disabled:pointer-events-none disabled:bg-surface-3 disabled:text-fg-muted disabled:opacity-100';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent hover:bg-accent-hover active:scale-[0.98]',
  dark: 'bg-stage text-on-stage hover:bg-stage-2 active:scale-[0.98]',
  outline:
    'border border-border-control bg-surface text-fg hover:border-accent hover:bg-accent-soft hover:text-accent active:scale-[0.98]',
  ghost:
    'text-accent hover:bg-accent-soft hover:text-accent-hover active:scale-[0.98]',
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
