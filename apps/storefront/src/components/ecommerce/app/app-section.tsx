import type { AppLink } from '@/config/home';

/**
 * Mobile-app download section (SS-224): parity with the live site's app
 * block. Rendered only from verified distribution URLs — the repository has
 * none yet, so `appLinks: []` keeps the section hidden rather than
 * advertising placeholder destinations.
 */
export function AppSection({ links }: { links: AppLink[] }) {
  if (links.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="app-heading" className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 sm:pb-14 lg:px-8">
      <div className="relative overflow-hidden stage-surface rounded-panel bg-stage px-6 py-10 text-center sm:px-12">
        <h2 id="app-heading" className="relative text-2xl font-bold text-on-stage">
          دریافت اپلیکیشن سبز سیستم
        </h2>
        <p className="relative mt-2 text-sm text-on-stage-secondary">
          خرید آسان‌تر از موبایل — دانلود مستقیم از مارکت‌ها
        </p>
        <ul role="list" className="relative mt-6 flex flex-wrap items-center justify-center gap-3">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-control bg-on-stage px-6 text-sm font-semibold text-stage transition-colors hover:bg-on-stage/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {link.label}
                <span className="sr-only"> (باز شدن در پنجره جدید)</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
