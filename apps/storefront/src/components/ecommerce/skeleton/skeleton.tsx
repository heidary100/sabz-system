/**
 * Base skeleton primitive (SS-217, shimmer SS-246): a sand block with a
 * directional light sweep that reads as "loading" rather than flickering.
 * Purely decorative — always `aria-hidden`, never fake content. The sweep
 * lives behind the reduced-motion guard and degrades to a static block.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`skeleton-shimmer rounded-md bg-sand-100 ${className}`}
    />
  );
}
