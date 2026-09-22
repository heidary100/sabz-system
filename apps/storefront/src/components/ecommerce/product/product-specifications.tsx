import type { CatalogProductDetailDto } from '@sabz/types';
import { groupSpecs, physicalSpecRows } from '@/lib/specs';

/**
 * Product specifications (SS-214, server). Groups the SS-202 `specs[]`
 * display pairs by attribute group, then appends presentation-only rows from
 * first-class product fields (warranty, origin, weight, dimensions). Renders
 * nothing when both sources are empty — no fake rows.
 */
export function ProductSpecifications({
  product,
}: {
  product: CatalogProductDetailDto;
}) {
  const groups = groupSpecs(product.specs);
  const physical = physicalSpecRows({
    weightKg: product.weightKg,
    widthCm: product.widthCm,
    heightCm: product.heightCm,
    depthCm: product.depthCm,
    warranty: product.warranty,
    originCountry: product.originCountry,
  });

  if (groups.length === 0 && physical.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title}>
          {groups.length > 1 || physical.length > 0 ? (
            <h3 className="mb-2 text-sm font-semibold text-gray-500">
              {group.title}
            </h3>
          ) : null}
          <dl className="overflow-hidden rounded-xl border border-sand-200 bg-white text-sm">
            {group.rows.map((row, index) => (
              <div
                key={`${row.key}-${index}`}
                className={`grid grid-cols-[minmax(0,10rem)_1fr] gap-3 px-4 py-2.5 sm:grid-cols-[minmax(0,14rem)_1fr] ${
                  index % 2 === 1 ? 'bg-sand-50' : 'bg-white'
                }`}
              >
                <dt className="text-gray-600">{row.key}</dt>
                <dd dir="auto" className="text-ink-900">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {physical.length > 0 ? (
        <section aria-label="مشخصات فیزیکی">
          <h3 className="mb-2 text-sm font-semibold text-gray-500">
            مشخصات فیزیکی
          </h3>
          <dl className="overflow-hidden rounded-xl border border-sand-200 bg-white text-sm">
            {physical.map((row, index) => (
              <div
                key={`${row.key}-${index}`}
                className={`grid grid-cols-[minmax(0,10rem)_1fr] gap-3 px-4 py-2.5 sm:grid-cols-[minmax(0,14rem)_1fr] ${
                  (groups.length + index) % 2 === 1 ? 'bg-sand-50' : 'bg-white'
                }`}
              >
                <dt className="text-gray-600">{row.key}</dt>
                <dd dir="auto" className="text-ink-900">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
