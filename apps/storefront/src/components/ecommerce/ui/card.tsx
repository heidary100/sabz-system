import type { HTMLAttributes } from 'react';

/**
 * Shared elevated-card surface (SS-221, tokenized Task 01): one resting
 * surface, one border, one optional hover lift. Content structure belongs to
 * the caller; this component only owns the material.
 */
export function Card({
  hover = false,
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={`rounded-card border border-border bg-surface ${
        hover ? 'hover-lift' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
