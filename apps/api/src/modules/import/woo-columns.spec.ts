import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  classifyAttributeColumn,
  classifyColumn,
  classifyHeaders,
  explicitHeaderNames,
  fallbackHeaders,
} from './woo-columns';
import { parseWooCsv } from './woo-parse';

export const FIXTURE_PATH = join(__dirname, 'fixtures', 'woo-sample.csv');

function fixtureHeader(): string[] {
  const { header } = parseWooCsv(readFileSync(FIXTURE_PATH));
  return header;
}

describe('classifyColumn (SS-206)', () => {
  it('maps core identity, pricing, and taxonomy columns', () => {
    expect(classifyColumn('شناسه')).toMatchObject({
      disposition: 'mapped',
      target: 'sourceId',
    });
    expect(classifyColumn('قیمت عادی')).toMatchObject({
      disposition: 'mapped',
      target: 'Variant.price',
    });
    expect(classifyColumn('دسته‌ها')).toMatchObject({
      disposition: 'mapped',
    });
    expect(classifyColumn('متا: custom_attributes')).toMatchObject({
      disposition: 'mapped',
    });
  });

  it('defers wholesale, promo, and relation columns (preserved raw)', () => {
    expect(
      classifyColumn('متا: wholesale_customer_wholesale_price').disposition,
    ).toBe('deferred');
    expect(classifyColumn('متا: special_offers').disposition).toBe('deferred');
    expect(
      classifyColumn('محصولات مشابه (Cross-Sells)').disposition,
    ).toBe('deferred');
  });

  it('ignores ACF field keys, scores, and theme internals', () => {
    expect(classifyColumn('متا: _garrantie')).toMatchObject({
      disposition: 'ignored',
    });
    expect(classifyColumn('متا: rank_math_seo_score').disposition).toBe(
      'ignored',
    );
    expect(classifyColumn('متا: _elementor_data').disposition).toBe('ignored');
    expect(classifyColumn('وضعیت مالیات').disposition).toBe('ignored');
  });

  it('classifies indexed attribute slots by pattern', () => {
    expect(classifyColumn('نام 1 صفت')).toMatchObject({
      disposition: 'mapped',
      via: 'pattern',
    });
    expect(classifyColumn('مقدار(های) 22 صفت').disposition).toBe('mapped');
    expect(classifyColumn('پیشفرض 2 صفت')).toMatchObject({
      target: 'variation default option',
    });
    expect(classifyColumn('نام 23 صفت').via).toBe('fallback');
    expect(classifyAttributeColumn('برندها')).toBeNull();
    expect(classifyAttributeColumn('نام 0 صفت')).toBeNull();
  });

  it('covers the full 243-column export header with zero fallback', () => {
    const header = fixtureHeader();
    expect(header).toHaveLength(243);
    expect(fallbackHeaders(header)).toEqual([]);
    const histogram = classifyHeaders(header);
    expect(
      histogram.mapped.length +
        histogram.deferred.length +
        histogram.ignored.length,
    ).toBe(243);
  });

  it('every explicit key exists in the real header (typo guard)', () => {
    const header = new Set(fixtureHeader());
    const missing = explicitHeaderNames().filter((name) => !header.has(name));
    expect(missing).toEqual([]);
  });
});
