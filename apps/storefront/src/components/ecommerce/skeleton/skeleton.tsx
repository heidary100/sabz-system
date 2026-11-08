/**
 * Base skeleton primitive (SS-217, tokenized Task 01): a surface block with
 * a directional light sweep that reads as "loading" rather than flickering.
 * Purely decorative — always `aria-hidden`, never fake content. `tone="plate"`
 * is used inside the intentionally light product-image plate.
 */
export function Skeleton({
  className = '',
  tone = 'surface',
}: {
  className?: string;
  tone?: 'surface' | 'plate';
}) {
  return (
    <div
      aria-hidden
      className={`skeleton-shimmer rounded-control ${
        tone === 'plate' ? 'bg-plate-border/50' : 'bg-surface-2'
      } ${className}`}
    />
  );
}
