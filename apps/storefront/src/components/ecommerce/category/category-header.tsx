import { formatFaNumber } from '@/lib/format';

/**
 * Category landing header (SS-212): eyebrow + H1 + canonical roll-up count.
 * When listing filters narrow the results, a subtle secondary line keeps the
 * canonical count authoritative instead of silently replacing it.
 */
export function CategoryHeader({
  name,
  rollUpCount,
  filteredTotal,
}: {
  name: string;
  rollUpCount: number;
  filteredTotal?: number;
}) {
  const showFiltered =
    filteredTotal !== undefined && filteredTotal !== rollUpCount;

  return (
    <div>
      <p className="text-sm text-gray-500">دسته‌بندی</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
        {name}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        {formatFaNumber(rollUpCount)} کالا
      </p>
      {showFiltered ? (
        <p className="mt-1 text-xs text-gray-400" aria-live="polite">
          {formatFaNumber(filteredTotal!)} کالا با فیلترهای فعلی
        </p>
      ) : null}
    </div>
  );
}
