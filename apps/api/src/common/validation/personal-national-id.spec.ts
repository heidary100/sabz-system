import {
  PERSONAL_NATIONAL_ID_MESSAGES,
  foldDigitsToAscii,
  maskPersonalNationalId,
  normalizePersonalNationalId,
  validatePersonalNationalId,
} from './personal-national-id';

/**
 * SS-260 checksum oracle.
 *
 * Every value below is synthetic or a published illustrative example. None is
 * a real person's National ID. The MOD-11 calculation was independently
 * cross-checked against the public-domain reference implementation at
 * https://gist.github.com/ebraminio/5292017 and the Global IDs IR format
 * specification at https://globalids.dev/ir/national-code/.
 */
describe('personal national ID (SS-260)', () => {
  describe('foldDigitsToAscii', () => {
    it('folds Persian digits', () => {
      expect(foldDigitsToAscii('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
      expect(foldDigitsToAscii('۶۰۵۹۹۲۶۷۴۶')).toBe('6059926746');
    });

    it('folds Arabic-Indic digits', () => {
      expect(foldDigitsToAscii('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
      expect(foldDigitsToAscii('٦٠٥٩٩٢٦٧٤٦')).toBe('6059926746');
    });

    it('folds mixed forms positionally and leaves other characters untouched', () => {
      expect(foldDigitsToAscii('۶05۹92۶7۴6')).toBe('6059926746');
      expect(foldDigitsToAscii('605-992-6746')).toBe('605-992-6746');
      expect(foldDigitsToAscii('abc')).toBe('abc');
      expect(foldDigitsToAscii('')).toBe('');
    });
  });

  describe('normalizePersonalNationalId', () => {
    it('trims outer whitespace and normalizes supported digit forms', () => {
      expect(normalizePersonalNationalId(' ۶۰۵۹۹۲۶۷۴۶ ')).toBe('6059926746');
      expect(normalizePersonalNationalId('\t٦٠٥٩٩٢٦٧٤٦\n')).toBe(
        '6059926746',
      );
    });

    it('does not strip internal separators', () => {
      expect(normalizePersonalNationalId('605 992 6746')).toBe(
        '605 992 6746',
      );
      expect(normalizePersonalNationalId('605-992-6746')).toBe(
        '605-992-6746',
      );
    });

    it('returns null for non-string input', () => {
      expect(normalizePersonalNationalId(null)).toBeNull();
      expect(normalizePersonalNationalId(6059926746)).toBeNull();
      expect(normalizePersonalNationalId(['6059926746'])).toBeNull();
    });
  });

  describe('validatePersonalNationalId', () => {
    it.each([
      ['6059926746', 'Global IDs synthetic valid value'],
      ['7291363357', 'Global IDs published example'],
      ['1234567891', 'generated checksum-valid value'],
      ['1111111111', 'repeated-digit checksum-valid value'],
    ])('accepts %s (%s)', (value) => {
      expect(validatePersonalNationalId(value)).toEqual({
        ok: true,
        value,
      });
    });

    it('rejects a leading-zero value even when the checksum is valid', () => {
      for (const value of ['0013542419', '0012345679']) {
        expect(validatePersonalNationalId(value)).toEqual({
          ok: false,
          error: 'LEADING_ZERO',
        });
      }
    });

    it('folds Persian, Arabic-Indic and mixed digits to one canonical value', () => {
      for (const input of [
        '۶۰۵۹۹۲۶۷۴۶',
        '٦٠٥٩٩٢٦٧٤٦',
        '۶05۹92۶7۴6',
        ' 6059926746 ',
      ]) {
        expect(validatePersonalNationalId(input)).toEqual({
          ok: true,
          value: '6059926746',
        });
      }
    });

    it('rejects a wrong check digit', () => {
      expect(validatePersonalNationalId('6059926747')).toEqual({
        ok: false,
        error: 'CHECKSUM',
      });
    });

    it('rejects a transposed value', () => {
      expect(validatePersonalNationalId('6509926746')).toEqual({
        ok: false,
        error: 'CHECKSUM',
      });
    });

    it.each(['605992674', '60599267460', '60599A6746', '605 992 6746', '605-992-6746', '６０５９９２６７４６', '6059926746\u200f', '6059926746\u200c'])(
      'rejects invalid format %p',
      (value) => {
        expect(validatePersonalNationalId(value)).toEqual({
          ok: false,
          error: 'FORMAT',
        });
      },
    );

    it('rejects empty and whitespace-only input', () => {
      expect(validatePersonalNationalId('')).toEqual({
        ok: false,
        error: 'EMPTY',
      });
      expect(validatePersonalNationalId('   ')).toEqual({
        ok: false,
        error: 'EMPTY',
      });
    });

    it('rejects the all-zero placeholder but not other repeated digits', () => {
      expect(validatePersonalNationalId('0000000000')).toEqual({
        ok: false,
        error: 'PLACEHOLDER',
      });
      expect(validatePersonalNationalId('2222222222')).toEqual({
        ok: true,
        value: '2222222222',
      });
    });

    it('returns Persian messages that never echo the submitted value', () => {
      const submitted = '6059926747';
      for (const message of Object.values(PERSONAL_NATIONAL_ID_MESSAGES)) {
        expect(message).not.toContain(submitted);
      }
    });
  });

  describe('maskPersonalNationalId', () => {
    it('never exposes more than the last four digits', () => {
      expect(maskPersonalNationalId('6059926746')).toBe('****6746');
      expect(maskPersonalNationalId('0013542419')).toBe('****2419');
    });

    it('returns null for missing values', () => {
      expect(maskPersonalNationalId(null)).toBeNull();
      expect(maskPersonalNationalId(undefined)).toBeNull();
      expect(maskPersonalNationalId('')).toBeNull();
    });

    it('masks malformed stored values completely', () => {
      expect(maskPersonalNationalId('605992674')).toBe('****');
      expect(maskPersonalNationalId('60599A6746')).toBe('****');
    });
  });
});
