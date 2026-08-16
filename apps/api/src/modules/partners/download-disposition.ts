import type { PartnerDocumentSummary } from '@sabz/types';

function extensionFromMime(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  return 'jpg';
}

/**
 * Builds an RFC 6266 attachment Content-Disposition value. `filename*`
 * carries the real UTF-8 name (Persian etc.); the ASCII-safe `filename=`
 * value is only a fallback for legacy clients. The original name was already
 * sanitized at upload (no path separators/control chars).
 */
export function buildAttachmentDisposition(
  summary: PartnerDocumentSummary,
): string {
  const asciiFallback = summary.originalName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/"/g, "'")
    .trim();

  const fallback =
    asciiFallback || `document-${summary.id}.${extensionFromMime(summary.mimeType)}`;

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(summary.originalName)}`;
}
