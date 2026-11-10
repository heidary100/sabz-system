import { BadRequestException } from '@nestjs/common';
import { parseMerchMediaUpdateBody } from './media-update-input';

describe('parseMerchMediaUpdateBody', () => {
  it.each([null, undefined, [], 'altFa', 42, true])(
    'rejects non-record body %p with a BadRequestException',
    (body) => {
      expect(() => parseMerchMediaUpdateBody(body)).toThrow(BadRequestException);
    },
  );

  it('rejects unknown fields', () => {
    expect(() =>
      parseMerchMediaUpdateBody({
        altFa: 'متن',
        publishedAt: '2026-11-10T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
    try {
      parseMerchMediaUpdateBody({ storageKey: 'secret' });
    } catch (error) {
      expect((error as BadRequestException).message).toContain('storageKey');
    }
  });

  it('returns an empty patch when altFa is omitted', () => {
    expect(parseMerchMediaUpdateBody({})).toEqual({});
  });

  it('accepts and trims valid alt text', () => {
    expect(parseMerchMediaUpdateBody({ altFa: '  متن جایگزین  ' })).toEqual({
      altFa: 'متن جایگزین',
    });
  });

  it('normalizes null and whitespace-only alt text to null', () => {
    expect(parseMerchMediaUpdateBody({ altFa: null })).toEqual({ altFa: null });
    expect(parseMerchMediaUpdateBody({ altFa: '   ' })).toEqual({
      altFa: null,
    });
  });

  it('rejects non-string alt text and overlong values', () => {
    expect(() => parseMerchMediaUpdateBody({ altFa: 12 })).toThrow(BadRequestException);
    expect(() => parseMerchMediaUpdateBody({ altFa: 'x'.repeat(161) })).toThrow(
      BadRequestException,
    );
  });
});
