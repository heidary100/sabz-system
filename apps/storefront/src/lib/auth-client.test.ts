import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isValidIranianMobile,
  parseAuthPayload,
  requestOtp,
  toEnglishDigits,
} from './auth-client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('toEnglishDigits', () => {
  it('folds Persian digits to ASCII', () => {
    expect(toEnglishDigits('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789');
  });

  it('folds Arabic digits to ASCII', () => {
    expect(toEnglishDigits('٠٩١٢٣٤٥٦٧٨٩')).toBe('09123456789');
  });

  it('leaves ASCII and other characters untouched', () => {
    expect(toEnglishDigits('0912-abc')).toBe('0912-abc');
    expect(toEnglishDigits('')).toBe('');
  });
});

describe('isValidIranianMobile', () => {
  it('accepts a valid 09 mobile', () => {
    expect(isValidIranianMobile('09123456789')).toBe(true);
  });

  it('accepts Persian-digit input', () => {
    expect(isValidIranianMobile('۰۹۱۲۳۴۵۶۷۸۹')).toBe(true);
  });

  it('rejects short, long, non-09, and non-numeric input', () => {
    expect(isValidIranianMobile('0912345678')).toBe(false);
    expect(isValidIranianMobile('091234567890')).toBe(false);
    expect(isValidIranianMobile('08123456789')).toBe(false);
    expect(isValidIranianMobile('09abcdefghi')).toBe(false);
    expect(isValidIranianMobile('')).toBe(false);
  });
});

describe('parseAuthPayload', () => {
  it('extracts the session and access token', () => {
    expect(
      parseAuthPayload({
        verified: true,
        user: { id: 'u-1', mobile: '09123456789', status: 'ACTIVE' },
        accessToken: 'access',
        refreshToken: 'refresh',
      }),
    ).toEqual({
      session: { userId: 'u-1', mobile: '09123456789' },
      accessToken: 'access',
    });
  });

  it('throws on malformed payloads instead of planting a half session', () => {
    expect(() => parseAuthPayload(null)).toThrow();
    expect(() => parseAuthPayload({})).toThrow();
    expect(() =>
      parseAuthPayload({ user: { id: 'u-1' }, accessToken: 'access' }),
    ).toThrow();
    expect(() =>
      parseAuthPayload({ user: { id: 'u-1', mobile: '09123456789' } }),
    ).toThrow();
  });
});

describe('requestOtp', () => {
  it('posts the normalized mobile and resolves on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await requestOtp('۰۹۱۲۳۴۵۶۷۸۹');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ mobile: '09123456789' });
  });

  it('surfaces the API message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'محدودیت ارسال', statusCode: 429 }), {
          status: 429,
        }),
      ),
    );
    await expect(requestOtp('09123456789')).rejects.toThrow('محدودیت ارسال');
  });
});
