import Link from 'next/link';

/**
 * Shared placeholder surface for routes whose functionality arrives in a
 * later milestone (SS-124 binding decision: real UI from day one, function
 * later). Always real Persian copy — never stub text.
 */
export function PlaceholderPage({
  title,
  message,
  actionHref = '/products',
  actionLabel = 'مشاهده محصولات',
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <div className="rounded-panel border border-border bg-surface p-10 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-pill bg-accent-soft text-accent">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-7">
            <path
              d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-fg">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-fg-secondary">{message}</p>
        <Link
          href={actionHref}
          className="mt-8 inline-flex items-center justify-center rounded-control bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover"
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
