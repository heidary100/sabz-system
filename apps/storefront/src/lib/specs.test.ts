import { describe, expect, it } from 'vitest';
import type { CatalogProductSpecDto } from '@sabz/types';
import {
  groupSpecs,
  physicalSpecRows,
  UNGROUPED_SPECS_TITLE,
} from './specs';

function spec(
  attributeName: string,
  value: string,
  attributeGroup: string | null = null,
): CatalogProductSpecDto {
  return {
    attributeName,
    attributeSlug: attributeName,
    attributeGroup,
    value,
    valueSlug: value,
    sortOrder: 0,
  };
}

describe('groupSpecs', () => {
  it('returns no groups for empty specs', () => {
    expect(groupSpecs([])).toEqual([]);
  });

  it('preserves first-seen group order with ungrouped fallback title', () => {
    const groups = groupSpecs([
      spec('پردازنده', 'Core i7', 'سخت‌افزار'),
      spec('رنگ', 'مشکی'),
      spec('حافظه', '512GB', 'سخت‌افزار'),
    ]);
    expect(groups.map((group) => group.title)).toEqual([
      'سخت‌افزار',
      UNGROUPED_SPECS_TITLE,
    ]);
    expect(groups[0]!.rows.map((row) => row.key)).toEqual([
      'پردازنده',
      'حافظه',
    ]);
  });
});

describe('physicalSpecRows', () => {
  const empty = {
    weightKg: null,
    widthCm: null,
    heightCm: null,
    depthCm: null,
    warranty: null,
    originCountry: null,
  };

  it('omits everything when all fields are absent', () => {
    expect(physicalSpecRows(empty)).toEqual([]);
  });

  it('renders warranty, origin, weight, and full dimensions', () => {
    const rows = physicalSpecRows({
      ...empty,
      warranty: '۱۸ ماه',
      originCountry: 'چین',
      weightKg: '1.5',
      widthCm: '10',
      heightCm: '20',
      depthCm: '30',
    });
    expect(rows.map((row) => row.key)).toEqual([
      'ضمانت',
      'کشور سازنده',
      'وزن',
      'ابعاد',
    ]);
    expect(rows[3]!.value).toContain('×');
  });

  it('never renders zero or blank measurements', () => {
    const rows = physicalSpecRows({
      ...empty,
      weightKg: '0',
      widthCm: '',
      heightCm: '0.00',
      depthCm: null,
      warranty: '  ',
    });
    expect(rows).toEqual([]);
  });

  it('renders partial dimensions as individual rows', () => {
    const rows = physicalSpecRows({ ...empty, widthCm: '12.5' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toContain('عرض');
  });
});
