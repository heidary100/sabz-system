/**
 * Base skeleton primitive (SS-217): a subdued pulsing block on the Sabz sand
 * surface. Purely decorative — always `aria-hidden`, never fake content.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-sand-100 ${className}`}
    />
  );
}
