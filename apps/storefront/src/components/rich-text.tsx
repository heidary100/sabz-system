/**
 * Renders the product long description for customers.
 *
 * The description is persisted as allowlist-sanitized HTML (the API sanitizes
 * every product description before storage), so it is safe to render directly.
 * This component centralizes that rendering with RTL-first typography so any
 * future product detail page displays formatted rich text — never raw HTML.
 */
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
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}