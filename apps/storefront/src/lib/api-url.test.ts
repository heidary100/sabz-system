import { describe, expect, it } from 'vitest';
import {
  DEV_API_FALLBACK,
  getImageRemotePatterns,
  resolveApiConfig,
  resolveBrowserApiBaseUrl,
  resolveBrowserMediaUrl,
  resolveInternalApiBaseUrl,
  resolveMediaBaseUrl,
  resolveOptimizerMediaUrl,
} from './api-url';

describe('API base URL resolution', () => {
  it('accepts absolute HTTP and HTTPS origins', () => {
    expect(resolveBrowserApiBaseUrl('http://localhost:3000/api/v1', true)).toBe(
      'http://localhost:3000/api/v1',
    );
    expect(
      resolveBrowserApiBaseUrl('https://shop.example.com/api/v1/', true),
    ).toBe('https://shop.example.com/api/v1');
  });

  it('accepts a root-relative same-origin browser base', () => {
    expect(resolveBrowserApiBaseUrl('/api/v1', true)).toBe('/api/v1');
    expect(resolveBrowserApiBaseUrl('/api/v1/', true)).toBe('/api/v1');
  });

  it('uses the development fallback only outside production', () => {
    expect(resolveBrowserApiBaseUrl(undefined, false)).toBe(DEV_API_FALLBACK);
    expect(() => resolveBrowserApiBaseUrl(undefined, true)).toThrow(
      /NEXT_PUBLIC_API_BASE_URL/,
    );
  });

  it('rejects invalid, protocol-relative, and non-http bases', () => {
    for (const value of ['api/v1', '//evil.example/api/v1', 'ftp://api.example']) {
      expect(() => resolveBrowserApiBaseUrl(value, true)).toThrow(
        /NEXT_PUBLIC_API_BASE_URL/,
      );
    }
  });

  it('requires an absolute internal base when the browser base is relative', () => {
    expect(() => resolveInternalApiBaseUrl(undefined, '/api/v1')).toThrow(
      /API_INTERNAL_BASE_URL/,
    );
    expect(() =>
      resolveInternalApiBaseUrl('/api/v1', 'https://shop.example.com/api/v1'),
    ).toThrow(/API_INTERNAL_BASE_URL/);
    expect(
      resolveInternalApiBaseUrl(undefined, 'https://shop.example.com/api/v1'),
    ).toBe('https://shop.example.com/api/v1');
    expect(
      resolveInternalApiBaseUrl('http://api:3000/api/v1', '/api/v1'),
    ).toBe('http://api:3000/api/v1');
  });

  it('defaults the media base to the browser base and accepts relative media', () => {
    expect(resolveMediaBaseUrl(undefined, '/api/v1')).toBe('/api/v1');
    expect(resolveMediaBaseUrl('/media', 'https://shop.example.com/api/v1')).toBe(
      '/media',
    );
    expect(() => resolveMediaBaseUrl('media', '/api/v1')).toThrow(
      /NEXT_PUBLIC_MEDIA_BASE_URL/,
    );
  });

  it('resolves a complete production config', () => {
    expect(
      resolveApiConfig(
        {
          NEXT_PUBLIC_API_BASE_URL: '/api/v1',
          API_INTERNAL_BASE_URL: 'http://api:3000/api/v1',
          NEXT_PUBLIC_MEDIA_BASE_URL: 'http://api:3000/api/v1',
        },
        { production: true },
      ),
    ).toEqual({
      browserBaseUrl: '/api/v1',
      internalBaseUrl: 'http://api:3000/api/v1',
      mediaBaseUrl: 'http://api:3000/api/v1',
    });
  });
});

describe('media URL resolution', () => {
  it('resolves browser media against absolute and relative bases', () => {
    expect(
      resolveBrowserMediaUrl(
        '/api/v1/catalog/media/a',
        'https://shop.example.com/api/v1',
      ),
    ).toBe('https://shop.example.com/api/v1/catalog/media/a');
    expect(resolveBrowserMediaUrl('/api/v1/catalog/media/a', '/api/v1')).toBe(
      '/api/v1/catalog/media/a',
    );
  });

  it('resolves optimizer media against absolute and relative bases', () => {
    expect(
      resolveOptimizerMediaUrl(
        '/api/v1/catalog/media/a/thumbnail',
        'http://api:3000/api/v1',
      ),
    ).toBe('http://api:3000/api/v1/catalog/media/a/thumbnail');
    expect(
      resolveOptimizerMediaUrl('/api/v1/catalog/media/a/thumbnail', '/api/v1'),
    ).toBe('/api/v1/catalog/media/a/thumbnail');
  });

  it('rejects missing and unsafe media paths', () => {
    expect(resolveBrowserMediaUrl(null, '/api/v1')).toBeNull();
    expect(resolveBrowserMediaUrl('', '/api/v1')).toBeNull();
    expect(resolveBrowserMediaUrl('javascript:alert(1)', '/api/v1')).toBeNull();
    expect(resolveOptimizerMediaUrl('//evil.example/x', '/api/v1')).toBeNull();
  });
});

describe('image remote patterns', () => {
  it('allow-lists only absolute origins and deduplicates them', () => {
    expect(
      getImageRemotePatterns({
        browserBaseUrl: 'https://shop.example.com/api/v1',
        mediaBaseUrl: 'https://shop.example.com/api/v1',
      }),
    ).toEqual([
      {
        protocol: 'https',
        hostname: 'shop.example.com',
      },
    ]);
  });

  it('omits relative bases instead of inventing a host', () => {
    expect(
      getImageRemotePatterns({
        browserBaseUrl: '/api/v1',
        mediaBaseUrl: 'http://api:3000/api/v1',
      }),
    ).toEqual([
      {
        protocol: 'http',
        hostname: 'api',
        port: '3000',
      },
    ]);
    expect(
      getImageRemotePatterns({
        browserBaseUrl: '/api/v1',
        mediaBaseUrl: '/api/v1',
      }),
    ).toEqual([]);
  });
});
