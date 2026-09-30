import Link from 'next/link';
import type { CatalogCategoryNode } from '@sabz/types';
import { homeConfig } from '@/config/home';
import { BrandLockup } from '@/components/ecommerce/brand/brand-lockup';
import { ScrollTopButton } from '@/components/ecommerce/ui/scroll-top-button';
import { brand } from '@/lib/brand';
import { formatFaNumber } from '@/lib/format';
import { resolveFeaturedCategories } from '@/lib/home';
import { contactChannels, filterValidFooterLinks, siteConfig } from '@/lib/site';

/**
 * Storefront footer (SS-124, SS-215, upgraded SS-224 with the verified
 * company facts from sabzsistem.com; cinematic dark treatment SS-246).
 * Config-driven and honest: brand + curated navigation always; contact,
 * social, and legal groups render only from verified values. Placeholder
 * routes are never advertised — the footer links only to real customer
 * functionality.
 */
export function SiteFooter({ categories }: { categories: CatalogCategoryNode[] }) {
  // Same curation source as the home page — no second slicing policy. Falls
  // back to the deterministic tree order when nothing is curated.
  const featuredCategories = resolveFeaturedCategories(
    categories,
    homeConfig.featuredCategorySlugs,
    homeConfig.maxCategoryTiles,
  );
  const socials = filterValidFooterLinks(siteConfig.socials);
  const legalLinks = filterValidFooterLinks(siteConfig.legalLinks);
  const hasContact =
    siteConfig.address !== null ||
    contactChannels.phones.length > 0 ||
    siteConfig.hours !== null ||
    siteConfig.email !== null;

  const shopLinks: Array<{ href: string; label: string; external?: boolean }> = [
    { href: '/products', label: 'همه محصولات' },
    { href: '/categories', label: 'همه دسته‌بندی‌ها' },
    { href: '/blog', label: 'وبلاگ' },
    { href: '/about', label: 'درباره ما' },
    { href: '/contact', label: 'تماس با ما' },
    ...legalLinks.map((link) => ({ href: link.href, label: link.label, external: link.external })),
  ];

  return (
    <footer className="relative mt-16 overflow-hidden bg-ink-950 text-gray-300">
      {/* Cinematic stage (SS-246): brand-green glows anchor the footer to the
          hero's visual language. Decorative, aria-hidden. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 start-1/4 size-96 rounded-full bg-sabz-700/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 end-0 size-80 rounded-full bg-sabz-800/25 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <BrandLockup wordmarkClassName="text-lg font-bold text-white" />
            {siteConfig.blurb ? (
              <p className="mt-4 max-w-sm text-sm leading-7 text-gray-400">
                {siteConfig.blurb}
              </p>
            ) : null}
            {socials.length > 0 ? (
              <nav aria-label="شبکه‌های اجتماعی" className="mt-5">
                <ul role="list" className="flex flex-wrap gap-2">
                  {socials.map((social) => (
                    <li key={social.href}>
                      <a
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center rounded-full bg-white/5 px-3.5 text-xs font-medium text-gray-300 ring-1 ring-inset ring-white/10 transition-all duration-200 hover:bg-sabz-700 hover:text-white hover:ring-sabz-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-400"
                      >
                        {social.label}
                        <span className="sr-only"> (باز شدن در پنجره جدید)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </div>

          <nav aria-label="دسته‌بندی‌های فروشگاه" className="lg:col-span-3">
            <p className="text-sm font-bold text-white">دسته‌بندی‌ها</p>
            <ul role="list" className="mt-5 space-y-3">
              {featuredCategories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/categories/${category.slug}`}
                    className="group inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-sabz-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-400"
                  >
                    <span
                      aria-hidden="true"
                      className="h-px w-0 bg-sabz-400 transition-all duration-300 ease-[var(--ease-swift)] group-hover:w-3"
                    />
                    {category.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/categories"
                  className="text-sm font-medium text-sabz-300 hover:text-sabz-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-400"
                >
                  همه دسته‌بندی‌ها ←
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="فروشگاه" className="lg:col-span-2">
            <p className="text-sm font-bold text-white">فروشگاه</p>
            <ul role="list" className="mt-5 space-y-3">
              {shopLinks.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-400 transition-colors hover:text-sabz-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-400"
                    >
                      {link.label}
                      <span className="sr-only"> (باز شدن در پنجره جدید)</span>
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-gray-400 transition-colors hover:text-sabz-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-400"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {hasContact ? (
            <div className="lg:col-span-3">
              <p className="text-sm font-bold text-white">تماس با ما</p>
              <ul role="list" className="mt-5 space-y-3 text-sm text-gray-400">
                {siteConfig.address ? (
                  <li className="leading-7">
                    {siteConfig.address}
                    {contactChannels.postalCode ? (
                      <span className="mt-0.5 block text-xs text-gray-500">
                        کدپستی: {contactChannels.postalCode}
                      </span>
                    ) : null}
                  </li>
                ) : null}
                {contactChannels.phones.map((phone) => (
                  <li key={phone.tel}>
                    <a
                      href={`tel:${phone.tel}`}
                      dir="ltr"
                      className="inline-block rounded-sm transition-colors hover:text-sabz-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-400"
                    >
                      {phone.display}
                    </a>
                  </li>
                ))}
                {siteConfig.hours ? (
                  <li className="leading-7">{siteConfig.hours}</li>
                ) : null}
                {siteConfig.email ? (
                  <li>
                    <a
                      href={`mailto:${siteConfig.email}`}
                      dir="ltr"
                      className="rounded-sm break-all transition-colors hover:text-sabz-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-400"
                    >
                      {siteConfig.email}
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-xs leading-5 text-gray-500">
            © {formatFaNumber(new Date().getFullYear())} {brand.nameFa} — تمامی
            حقوق محفوظ است.
          </p>
          <p className="text-xs text-gray-600">{brand.nameEn}</p>
        </div>
      </div>
      <ScrollTopButton />
    </footer>
  );
}
