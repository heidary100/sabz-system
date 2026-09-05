import clsx from 'clsx'

/**
 * Renders the server-sanitized product long description. The backend persists
 * the description only after an allowlist sanitization pass (description-sanitize),
 * so the HTML is safe to render directly. Styling comes from the `.rich-text`
 * component styles in index.css (RTL, theme-aware).
 */
export function RichText({
  html,
  className,
}: {
  html: string | null | undefined
  className?: string
}) {
  if (!html || html.trim().length === 0) {
    return null
  }
  return (
    <div
      dir="rtl"
      className={clsx('rich-text', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}