import { describe, expect, it } from 'vitest';
import { toEnglishDigits } from './digits';

describe('toEnglishDigits (SS-260 extraction)', () => {
  it('folds Persian digits', () => {
    expect(toEnglishDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
  });

  it('folds Arabic-Indic digits', () => {
    expect(toEnglishDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });

  it('folds mixed input and leaves other characters untouched', () => {
    expect(toEnglishDigits('۶05۹92۶7۴6')).toBe('6059926746');
    expect(toEnglishDigits('0912-abc')).toBe('0912-abc');
    expect(toEnglishDigits('')).toBe('');
  });
});
