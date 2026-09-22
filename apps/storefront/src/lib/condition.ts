/**
 * Single source of truth for product-condition labels (SS-213).
 *
 * Consumed by `ProductCard`, `FiltersPanel`, and the active-pills UI so the
 * five `ProductCondition` values are never re-declared per file. Text is
 * always rendered alongside any color indicator (color is never the sole
 * signal). No new condition values may be added here — they mirror the Prisma
 * `ProductCondition` enum.
 */

export const CONDITION_LABELS: Record<string, string> = {
  NEW: 'نو',
  OPEN_BOX: 'جعبه‌باز',
  REFURBISHED: 'بازسازی‌شده',
  USED: 'کارکرده',
  STOCK_CLEARANCE: 'کلیرنس',
};

export const CONDITION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'همه' },
  { value: 'NEW', label: CONDITION_LABELS.NEW! },
  { value: 'OPEN_BOX', label: CONDITION_LABELS.OPEN_BOX! },
  { value: 'REFURBISHED', label: CONDITION_LABELS.REFURBISHED! },
  { value: 'USED', label: CONDITION_LABELS.USED! },
  { value: 'STOCK_CLEARANCE', label: CONDITION_LABELS.STOCK_CLEARANCE! },
];

/** Persian label for a condition value, falling back to the raw value. */
export function conditionLabel(value: string): string {
  return CONDITION_LABELS[value] ?? value;
}
