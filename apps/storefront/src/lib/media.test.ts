import { describe, expect, it } from 'vitest';
import { mediaImageUrl, mediaUrl } from './catalog';

/**
 * Media URL host split: next/image sources are fetched server-side by the
 * optimizer (compose-internal host inside Docker), while browser-fetched
 * sources (e.g. <video>) must stay on the browser-facing host.
 */
describe('media URLs', () => {
  it('resolves browser URLs against the public API base', () => {
    expect(mediaUrl('/api/v1/catalog/media/abc')).toBe(
      'http://localhost:3000/api/v1/catalog/media/abc',
    );
  });

  it('resolves optimizer URLs against the media base', () => {
    const url = mediaImageUrl('/api/v1/catalog/media/abc/thumbnail');
    expect(url).not.toBeNull();
    expect(url).toContain('/api/v1/catalog/media/abc/thumbnail');
  });

  it('returns null for missing paths', () => {
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl(undefined)).toBeNull();
    expect(mediaImageUrl(null)).toBeNull();
  });
});
