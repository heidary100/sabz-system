import Link from 'next/link';
import type { CategoryBanner } from '@/config/home';

/**
 * Collection banner tiles (SS-224): the live site's home banner row. No
 * banner imagery has been supplied yet, so tiles render as cinematic ink
 * surfaces with typographic content — the image field can layer in later
 * without structural change. Hidden entirely when unconfigured.
 */
export function CategoryBanners({ banners }: { banners: CategoryBanner[] }) {
  if (banners.length === 0) {
    return null;
  }
  return (
    <section aria-label="دسته‌های منتخب" className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 sm:pt-14 lg:px-8">
      <ul role="list" className="stagger grid grid-cols-1 gap-4 sm:grid-cols-3">
        {banners.map((banner) => (
          <li key={banner.href + banner.title}>
            <Link
              href={banner.href}
              className="hover-lift group relative flex min-h-44 flex-col justify-end overflow-hidden rounded-2xl bg-gradient-ink p-6 shadow-card ring-1 ring-white/5"
            >
              {/* Decorative glows (aria-hidden): one accent blob that
                  brightens and drifts toward the reader on hover. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -start-10 -top-10 size-44 rounded-full bg-sabz-500/25 blur-2xl transition-all duration-500 group-hover:scale-125 group-hover:bg-sabz-500/40"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-16 end-6 size-32 rounded-full bg-sabz-700/30 blur-2xl"
              />
              <span className="relative text-xl font-bold text-white">{banner.title}</span>
              {banner.subtitle ? (
                <span className="relative mt-1 text-sm text-gray-300">{banner.subtitle}</span>
              ) : null}
              <span className="relative mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-sabz-200 ring-1 ring-white/10 transition-colors group-hover:bg-white/20 group-hover:text-white">
                مشاهده
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-3.5 transition-transform duration-300 group-hover:-translate-x-0.5">
                  <path fillRule="evenodd" d="M12.78 5.22a.75.75 0 0 1 0 1.06L9.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                </svg>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
