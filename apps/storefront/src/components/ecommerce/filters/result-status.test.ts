import { describe, expect, it } from 'vitest';
import { resultStatusText } from './result-status';

/**
 * SS-218: the listing live-region announcement must stay a single concise
 * line — the count with optional filter/search context — so screen readers
 * never re-read the product grid on every facet change.
 */
describe('resultStatusText', () => {
  it('formats the plain count with Persian numerals', () => {
    expect(resultStatusText(24, false)).toBe('۲۴ کالا');
  });

  it('appends the filter context while filters are active', () => {
    expect(resultStatusText(7, true)).toBe('۷ کالا با فیلترهای فعلی');
  });

  it('appends the search query when one is active', () => {
    expect(resultStatusText(3, true, 'ماوس')).toBe(
      '۳ کالا با فیلترهای فعلی برای «ماوس»',
    );
    expect(resultStatusText(3, false, 'ماوس')).toBe('۳ کالا برای «ماوس»');
  });

  it('announces zero results explicitly', () => {
    expect(resultStatusText(0, true)).toBe('۰ کالا با فیلترهای فعلی');
  });
});
