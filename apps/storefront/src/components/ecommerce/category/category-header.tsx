import { formatFaNumber } from '@/lib/format';
import { ResultStatus } from '@/components/ecommerce/filters/result-status';

/**
 * Category landing header (SS-212): eyebrow + H1 + canonical roll-up count.
 * When listing filters narrow the results, a subtle secondary line keeps the
 * canonical count authoritative instead of silently replacing it. The
 * filtered line is a client `role="status"` island (SS-218): a
 * server-rendered aria-live node remounts on every navigation and never
 * announces.
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
        <ResultStatus
          total={filteredTotal!}
          filtering
          className="mt-1 text-xs text-gray-600"
        />
      ) : null}
    </div>
  );
}
