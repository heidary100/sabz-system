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

/**
 * Persian display labels for imported spec keys (SS-227). The Woo import
 * stores many attribute names in English (CPU, RAM, GPU, …); a Persian-first
 * storefront maps the common keys and falls back to the raw name — unknown
 * keys must still render, never disappear. Matching is case-insensitive on
 * the trimmed key.
 */
const SPEC_LABEL_FA: Record<string, string> = {
  cpu: 'پردازنده',
  processor: 'پردازنده',
  gpu: 'پردازنده گرافیکی',
  graphics: 'پردازنده گرافیکی',
  ram: 'حافظه رم',
  rom: 'حافظه داخلی',
  ssd: 'حافظه SSD',
  hdd: 'هارد دیسک',
  storage: 'حافظه',
  memory: 'حافظه',
  monitor: 'نمایشگر',
  display: 'نمایشگر',
  screen: 'نمایشگر',
  ports: 'پورت‌ها',
  port: 'پورت',
  os: 'سیستم‌عامل',
  operating: 'سیستم‌عامل',
  battery: 'باتری',
  camera: 'دوربین',
  resolution: 'وضوح',
  size: 'اندازه',
  type: 'نوع',
  color: 'رنگ',
  material: 'جنس',
  capacity: 'ظرفیت',
  weight: 'وزن',
  dimensions: 'ابعاد',
  speed: 'سرعت',
  power: 'توان',
  model: 'مدل',
  brand: 'برند',
  warranty: 'گارانتی',
  connectivity: 'اتصال',
  interface: 'رابط',
};

export function specLabelFa(key: string): string {
  const mapped = SPEC_LABEL_FA[key.trim().toLowerCase()];
  return mapped ?? key;
}
