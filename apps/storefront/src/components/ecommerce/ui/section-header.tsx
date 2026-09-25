import Link from 'next/link';

/**
 * Shared section header (SS-221): the one pattern for titled content
 * sections on home/listing/detail — heading + optional subtitle + an
 * optional "see all" action. `id` is the heading's anchor for the parent
 * section's `aria-labelledby`.
 */
export function SectionHeader({
  id,
  title,
  subtitle,
  actionLabel = 'مشاهده همه',
  actionHref,
}: {
  /** Heading id — reference it from the wrapping section's aria-labelledby. */
  id: string;
  title: string;
  subtitle?: string;
  /** Label for the trailing action link; omit `actionHref` to hide it. */
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2
          id={id}
          className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl"
        >
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        ) : null}
      </div>
      {actionHref ? (
        <Link
          href={actionHref}
          className="shrink-0 rounded-sm pb-1 text-sm font-medium text-sabz-700 hover:text-sabz-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
