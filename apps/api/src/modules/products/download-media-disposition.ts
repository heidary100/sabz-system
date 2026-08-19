import type { ProductMediaSummary } from '@sabz/types';

function extensionFromMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'video/mp4') return 'mp4';
  return 'jpg';
}

/**
 * Builds an RFC 6266 attachment Content-Disposition value for a product media
 * download. `filename*` carries the real UTF-8 name (Persian etc.); the
 * ASCII-safe `filename=` value is only a fallback for legacy clients. The
 * original name was already sanitized at upload (no path separators/control
 * chars). The storageKey and filesystem paths are never exposed.
 *
 * This mirrors the Partner-domain disposition helper but is product-scoped and
 * typed against `ProductMediaSummary` so the Product domain stays independent
 * of the Partner domain.
 */
export function buildMediaAttachmentDisposition(
  summary: ProductMediaSummary,
): string {
  const asciiFallback = summary.originalName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/"/g, "'")
    .trim();

  const fallback =
    asciiFallback || `media-${summary.id}.${extensionFromMime(summary.mimeType)}`;

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(summary.originalName)}`;
}
