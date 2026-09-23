/**
 * SEO text helpers (SS-214 foundation).
 *
 * The product description is allowlist-sanitized HTML (API sanitizer); SEO
 * metadata and JSON-LD must never receive raw HTML. These pure helpers strip
 * tags, normalize whitespace, and truncate to a sensible length. No
 * general-purpose HTML library, no duplication of the API sanitizer.
 */

/** Fallback meta-description length (SEO convention). */
export const SEO_DESCRIPTION_MAX_LENGTH = 160;

/** Strips tags, decodes common entities, collapses whitespace. */
export function stripHtmlToText(html: string | null | undefined): string {
  if (!html) {
    return '';
  }
  return (
    html
      // Remove script/style content entirely, not just their tags.
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Truncates to `maxLength` chars without splitting a word when possible. */
export function truncateText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  const slice = trimmed.slice(0, maxLength).trimEnd();
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.5) {
    return slice.slice(0, lastSpace);
  }
  return slice;
}

/**
 * SEO description for a product: stripped + truncated HTML. Empty when the
 * input carries no readable text.
 */
export function seoDescriptionFromHtml(
  html: string | null | undefined,
  maxLength: number = SEO_DESCRIPTION_MAX_LENGTH,
): string {
  const text = stripHtmlToText(html);
  if (!text) {
    return '';
  }
  return truncateText(text, maxLength);
}
