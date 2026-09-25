import { formatFaNumber } from '@/lib/format';

/**
 * Static rating display (SS-221). Reviews themselves arrive with the
 * commerce stage (SS-236); this primitive exists so cards, detail pages, and
 * the future rating facet already render one consistent star pattern.
 *
 * Server-renderable and static: value comes from trusted data (the API), so
 * rounding happens at render without client state.
 */
export function Rating({
  value,
  count,
  className = '',
}: {
  /** Rating 0–5; fractional values round to the nearest half-step visually. */
  value: number;
  /** Optional review count rendered after the stars. */
  count?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const fullStars = Math.floor(clamped);
  const hasHalf = clamped - fullStars >= 0.5;

  return (
    <span
      role="img"
      aria-label={`امتیاز ${formatFaNumber(clamped)} از ۵${
        count !== undefined ? ` (${formatFaNumber(count)} دیدگاه)` : ''
      }`}
      className={`inline-flex items-center gap-1 ${className}`}
    >
      <span className="flex items-center gap-0.5 text-amber-500" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => {
          const filled = i < fullStars || (i === fullStars && hasHalf);
          return (
            <svg
              key={i}
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`size-4 ${filled ? '' : 'opacity-25'}`}
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 0 0 .95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 0 0-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.539 1.118l-3.367-2.446a1 1 0 0 0-1.175 0l-3.367 2.446c-.783.57-1.838-.197-1.538-1.118l1.286-3.957a1 1 0 0 0-.363-1.118L2.063 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 0 0 .951-.69l1.286-3.957Z" />
            </svg>
          );
        })}
      </span>
      {count !== undefined ? (
        <span className="text-xs text-gray-500">
          ({formatFaNumber(count)})
        </span>
      ) : null}
    </span>
  );
}
