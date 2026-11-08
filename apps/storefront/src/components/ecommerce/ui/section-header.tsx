import Link from 'next/link';

/**
 * Shared section header (SS-221, tokenized Task 01): the one pattern for
 * titled content sections on home/listing/detail — a solid accent rule,
 * heading, optional subtitle and an optional "see all" action. `id` is the
 * heading anchor for the parent section's `aria-labelledby`.
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
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1.5 h-7 w-1.5 shrink-0 rounded-pill bg-accent"
        />
        <div>
          <h2 id={id} className="text-balance text-h2 text-fg">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-body text-fg-muted">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actionHref ? (
        <Link
          href={actionHref}
          className="group inline-flex shrink-0 items-center gap-1 rounded-control pb-1 text-sm font-medium text-accent transition-colors hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {actionLabel}
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="size-4 transition-transform duration-300 ease-[var(--ease-swift)] group-hover:-translate-x-0.5"
          >
            <path
              fillRule="evenodd"
              d="M12.78 5.22a.75.75 0 0 1 0 1.06L9.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
      ) : null}
    </div>
  );
}
