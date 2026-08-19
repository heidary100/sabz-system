import type { ProductMediaSummary } from '@sabz/types';
import { buildMediaAttachmentDisposition } from './download-media-disposition';

function summary(overrides: Partial<ProductMediaSummary> = {}): ProductMediaSummary {
  return {
    id: 'media-1',
    productId: 'product-1',
    variantId: null,
    mediaType: 'IMAGE',
    originalName: 'عکس محصول.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 100,
    sortOrder: 0,
    isPrimary: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildMediaAttachmentDisposition', () => {
  it('includes the UTF-8 filename* for non-ASCII names', () => {
    const value = buildMediaAttachmentDisposition(summary());
    expect(value).toContain("filename*=UTF-8''");
    expect(value).toContain(encodeURIComponent('عکس محصول.jpg'));
  });

  it('escapes quotes and non-ASCII in the ASCII fallback', () => {
    const value = buildMediaAttachmentDisposition(summary({ originalName: 'a"b.jpg' }));
    expect(value).toContain('filename="a\'b.jpg"');
  });

  it('falls back to a generated name when the original is empty', () => {
    const value = buildMediaAttachmentDisposition(summary({ originalName: '' }));
    expect(value).toMatch(/filename="media-media-1\.jpg"/);
  });

  it('never exposes the storageKey or a filesystem path', () => {
    const value = buildMediaAttachmentDisposition(summary());
    expect(value).not.toContain('storageKey');
    expect(value).not.toContain('/');
  });
});
