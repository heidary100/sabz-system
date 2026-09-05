import { filterXSS } from 'xss';

/**
 * Rich-text description sanitization (product long description).
 *
 * The admin content editor produces HTML. Everything stored in the product
 * `description` column is passed through this XSS allowlist so content authored
 * by operators can later be rendered safely on the storefront without
 * re-sanitizing: dangerous tags (`script`, `iframe`, event handlers, `style`,
 * `class`, `data-*`) are stripped and link/image targets are restricted to
 * safe protocols.
 *
 * Allowed tags mirror the content-editor toolset: headings H1-H3, paragraphs,
 * lists, blockquotes, inline marks, links, images (with captions via
 * `figure`/`figcaption`), basic tables, and horizontal rules. `text-align` is
 * the only allowed inline style; image alignment/width travel as validated
 * `data-align`/`data-width` attributes (never presentation-only CSS). Links
 * must use http/https/mailto/tel (or a same-site /# path); image sources are
 * https URLs or the same-origin `/api/v1/description-images/...` route.
 * `javascript:`/`data:` targets are dropped.
 */

const WHITE_LIST = {
  p: ['style'],
  h1: ['style'],
  h2: ['style'],
  h3: ['style'],
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'loading'],
  figure: ['data-align', 'data-width'],
  figcaption: [],
  table: [],
  thead: [],
  tbody: [],
  tfoot: [],
  tr: [],
  th: ['colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
  ul: [],
  ol: [],
  li: [],
  blockquote: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  u: [],
  s: [],
  strike: [],
  hr: [],
  br: [],
};

const CSS_WHITE_LIST = { 'text-align': true };

const SAFE_URL = /^(https?|mailto|tel):/i;

const IMAGE_ALIGNMENTS = new Set(['left', 'center', 'right']);

function sanitizeAnchorHref(value: string): string {
  const trimmed = value.trim();
  if (SAFE_URL.test(trimmed)) {
    return trimmed;
  }
  // Allow same-site/relative links, but never anything scheme-like.
  if (/^[/#]/.test(trimmed) && !/^\s*[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

/**
 * Image `src` is restricted to http/https (remote images) or a same-origin
 * relative path (the API's `/api/v1/description-images/...` route). Data URIs
 * and any other scheme are dropped to prevent XSS and oversized inline blobs.
 */
function sanitizeImageSrc(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^\/api\/v1\/description-images\//.test(trimmed) && !/^\s*[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

/** Validates image `data-width` (integer px within sane bounds). */
function sanitizeImageDataWidth(value: string): string {
  const width = Number(value);
  if (!Number.isInteger(width) || width < 40 || width > 4000) {
    return '';
  }
  return String(width);
}

/**
 * Sanitizes rich-text HTML before it is persisted. Returns a trimmed string
 * (possibly empty).
 */
export function sanitizeRichText(html: string): string {
  const cleaned = filterXSS(html, {
    whiteList: WHITE_LIST,
    css: {
      whiteList: CSS_WHITE_LIST,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    onTagAttr(tag, name, value) {
      if (tag === 'a') {
        if (name === 'href') {
          const href = sanitizeAnchorHref(value);
          return href
            ? `href="${href}" target="_blank" rel="noopener noreferrer"`
            : '';
        }
        if (name === 'target' || name === 'rel') {
          // Managed by the href normalization above.
          return '';
        }
      }
      if (tag === 'img') {
        if (name === 'src') {
          const src = sanitizeImageSrc(value);
          return src ? `src="${src}"` : '';
        }
        if (name === 'width') {
          const width = sanitizeImageDataWidth(value);
          return width ? `width="${width}"` : '';
        }
        if (name === 'loading') {
          // Only lazy loading is emitted by the editor.
          return value.trim() === 'lazy' ? 'loading="lazy"' : '';
        }
      }
      if (tag === 'figure') {
        if (name === 'data-align') {
          const align = value.trim();
          return IMAGE_ALIGNMENTS.has(align) ? `data-align="${align}"` : '';
        }
        if (name === 'data-width') {
          const width = sanitizeImageDataWidth(value);
          return width ? `data-width="${width}"` : '';
        }
      }
      return;
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
  });
  return cleaned.trim();
}

/** Whether a description value carries any non-whitespace content. */
export function isRichTextEmpty(html: string): boolean {
  return sanitizeRichText(html).length === 0;
}