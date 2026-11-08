import { describe, expect, it } from 'vitest';
import {
  nationalIdMessage,
  normalizeNationalId,
  validateNationalId,
} from './national-id';

/**
 * SS-260 advisory mirror. The same vectors are used by the backend oracle;
 * the server remains authoritative.
 */
describe('storefront national ID helper', () => {
  it('normalizes Persian, Arabic-Indic, mixed and outer-whitespace forms', () => {
    for (const input of [
      '۶۰۵۹۹۲۶۷۴۶',
      '٦٠٥٩٩٢٦٧٤٦',
      '۶05۹92۶7۴6',
      ' 6059926746 ',
    ]) {
      expect(normalizeNationalId(input)).toBe('6059926746');
      expect(validateNationalId(input)).toEqual({
        status: 'valid',
        value: '6059926746',
      });
    }
  });

  it('rejects leading-zero values and accepts other checksum-valid repeated digits', () => {
    expect(validateNationalId('0013542419')).toEqual({
      status: 'leading_zero',
    });
    expect(validateNationalId('1111111111')).toEqual({
      status: 'valid',
      value: '1111111111',
    });
  });

  it('distinguishes empty, format, checksum and placeholder failures', () => {
    expect(validateNationalId('')).toEqual({ status: 'empty' });
    expect(validateNationalId('   ')).toEqual({ status: 'empty' });
    expect(validateNationalId('605992674')).toEqual({
      status: 'invalid_format',
    });
    expect(validateNationalId('605-992-6746')).toEqual({
      status: 'invalid_format',
    });
    expect(validateNationalId('6059926747')).toEqual({
      status: 'invalid_checksum',
    });
    expect(validateNationalId('6509926746')).toEqual({
      status: 'invalid_checksum',
    });
    expect(validateNationalId('0000000000')).toEqual({
      status: 'placeholder',
    });
  });

  it('maps each failure status to a Persian message without echoing input', () => {
    const messages = [
      nationalIdMessage('empty'),
      nationalIdMessage('invalid_format'),
      nationalIdMessage('invalid_checksum'),
      nationalIdMessage('placeholder'),
    ];
    expect(messages.every((message) => message.length > 0)).toBe(true);
    expect(messages.join(' ')).not.toContain('6059926747');
  });
});
