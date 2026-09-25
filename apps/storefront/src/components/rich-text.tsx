/**
 * Renders the product long description for customers.
 *
 * The description is persisted as allowlist-sanitized HTML (the API sanitizes
 * every product description before storage), so it is safe to render directly.
 * This component centralizes that rendering with RTL-first typography so any
 * future product detail page displays formatted rich text — never raw HTML.
 *
 * SS-217: long-description images are below the fold; the sanitized `<img>`
 * tags are augmented with lazy loading/decoding hints before render. The
 * attribute insertion never touches anything but `<img ...>` opening tags of
 * already-sanitized markup (attribute names are added verbatim — no user
 * content is involved), so the sanitizer's guarantees are preserved.
 */
const LAZY_IMG_HINTS = ' loading="lazy" decoding="async"';

export function RichText({
  html,
  className,
}: {
  html?: string | null;
  className?: string;
}) {
  if (!html || html.trim().length === 0) {
    return null;
  }
  return (
    <div
      dir="rtl"
      className={`rich-text ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: withLazyImages(html) }}
    />
  );
}

/** Adds loading/decoding hints to sanitized <img> tags lacking them. */
export function withLazyImages(html: string): string {
  return html.replace(
    /<img\b(?![^>]*\sloading=)([^>]*?)(\/?>)/gi,
    (_match, attrs: string, close: string) => {
      const hints = attrs.toLowerCase().includes('decoding=')
        ? ' loading="lazy"'
        : LAZY_IMG_HINTS;
      return `<img${attrs}${hints}${close}`;
    },
  );
}