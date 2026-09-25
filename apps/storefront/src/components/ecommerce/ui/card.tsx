import type { HTMLAttributes } from 'react';

/**
 * Shared elevated-card surface (SS-221): one resting elevation
 * (`shadow-card`), one hover elevation (`.hover-lift`), one border — so
 * product cards, tiles, and panels all read as the same material. Content
 * structure belongs to the caller; this component only owns the surface.
 */
export function Card({
  hover = false,
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-sand-200 bg-white shadow-card ${
        hover ? 'hover-lift' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
