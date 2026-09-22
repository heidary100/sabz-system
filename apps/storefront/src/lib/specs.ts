import type { CatalogProductSpecDto } from '@sabz/types';
import { formatFaNumber } from './format';

/**
 * Specification presentation helpers (SS-214).
 *
 * Pure grouping/ordering over the SS-202 `specs[]` DTO plus presentation-only
 * rows merged from first-class product fields. Domain ownership is unchanged:
 * warranty/origin/dimensions/weight stay product fields, only displayed here.
 */

export interface SpecRow {
  key: string;
  value: string;
}

/** Fallback group title for ungrouped attributes. */
export const UNGROUPED_SPECS_TITLE = 'مشخصات';

export interface SpecGroup {
  title: string;
  rows: SpecRow[];
}

/**
 * Groups specs by `attributeGroup` preserving first-seen group order and the
 * API `sortOrder` within each group (the DTO already arrives ordered).
 */
export function groupSpecs(specs: CatalogProductSpecDto[]): SpecGroup[] {
  const groups: SpecGroup[] = [];
  const byTitle = new Map<string, SpecGroup>();
  for (const spec of specs) {
    const title = spec.attributeGroup ?? UNGROUPED_SPECS_TITLE;
    let group = byTitle.get(title);
    if (!group) {
      group = { title, rows: [] };
      byTitle.set(title, group);
      groups.push(group);
    }
    group.rows.push({ key: spec.attributeName, value: spec.value });
  }
  return groups;
}

export interface PhysicalSpecInput {
  weightKg: string | null;
  widthCm: string | null;
  heightCm: string | null;
  depthCm: string | null;
  warranty: string | null;
  originCountry: string | null;
}

/** Present numeric measurement: non-null, non-empty, finite, and non-zero. */
function isMeasurement(value: string | null): value is string {
  if (value === null || value.trim() === '') {
    return false;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric !== 0;
}

function formatMeasure(value: string): string {
  return formatFaNumber(Number(value));
}

/**
 * Presentation-only rows from first-class product fields. Omits null/empty
 * values and never renders zero as a measurement. Empty input yields [] so
 * the section can be omitted entirely.
 */
export function physicalSpecRows(input: PhysicalSpecInput): SpecRow[] {
  const rows: SpecRow[] = [];
  const warranty = input.warranty?.trim();
  if (warranty) {
    rows.push({ key: 'ضمانت', value: warranty });
  }
  const origin = input.originCountry?.trim();
  if (origin) {
    rows.push({ key: 'کشور سازنده', value: origin });
  }
  if (isMeasurement(input.weightKg)) {
    rows.push({ key: 'وزن', value: `${formatMeasure(input.weightKg)} کیلوگرم` });
  }
  const dims = [
    { label: 'عرض', value: input.widthCm },
    { label: 'ارتفاع', value: input.heightCm },
    { label: 'عمق', value: input.depthCm },
  ].filter((dim): dim is { label: string; value: string } =>
    isMeasurement(dim.value),
  );
  if (dims.length === 3) {
    rows.push({
      key: 'ابعاد',
      value: `${dims.map((dim) => formatMeasure(dim.value)).join(' × ')} سانتی‌متر`,
    });
  } else {
    for (const dim of dims) {
      rows.push({
        key: `${dim.label} (سانتی‌متر)`,
        value: formatMeasure(dim.value),
      });
    }
  }
  return rows;
}
