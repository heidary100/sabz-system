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
 * company facts from sabzsistem.com). Config-driven and honest: brand +
 * curated navigation always; contact, social, and legal groups render only
 * from verified values. Placeholder routes (`/cart`, `/account`, `/about`,
 * `/contact`, `/terms`) are never advertised — those pages stay reachable by
 * URL for their milestone owners, but the footer links only to real customer
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

  return (
    <footer className="mt-16 border-t border-sand-200 bg-sand-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <BrandLockup wordmarkClassName="text-base font-bold text-sabz-800" />
            {siteConfig.blurb ? (
              <p className="mt-3 text-sm leading-6 text-gray-600">
                {siteConfig.blurb}
              </p>
            ) : null}
            {socials.length > 0 ? (
              <nav aria-label="شبکه‌های اجتماعی" className="mt-4">
                <ul role="list" className="flex flex-wrap gap-x-4 gap-y-2">
                  {socials.map((social) => (
                    <li key={social.href}>
                      <a
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-sm text-sm text-gray-600 underline-offset-4 hover:text-sabz-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
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

          <nav aria-label="دسته‌بندی‌های فروشگاه">
            <p className="text-sm font-semibold text-ink-900">دسته‌بندی‌ها</p>
            <ul role="list" className="mt-4 space-y-2.5">
              {featuredCategories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/categories/${category.slug}`}
                    className="rounded-sm text-sm text-gray-600 hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/categories"
                  className="rounded-sm text-sm font-medium text-sabz-700 hover:text-sabz-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
                >
                  همه دسته‌بندی‌ها
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="فروشگاه">
            <p className="text-sm font-semibold text-ink-900">فروشگاه</p>
            <ul role="list" className="mt-4 space-y-2.5">
              <li>
                <Link href="/products" className="rounded-sm text-sm text-gray-600 hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700">
                  همه محصولات
                </Link>
              </li>
              <li>
                <Link href="/categories" className="rounded-sm text-sm text-gray-600 hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700">
                  همه دسته‌بندی‌ها
                </Link>
              </li>
            </ul>
          </nav>

          {hasContact ? (
            <div>
              <p className="text-sm font-semibold text-ink-900">تماس</p>
              <ul role="list" className="mt-4 space-y-2.5 text-sm text-gray-600">
                {siteConfig.address ? (
                  <li className="leading-6">
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
                      className="inline-block rounded-sm hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
                    >
                      {phone.display}
                    </a>
                  </li>
                ))}
                {siteConfig.hours ? (
                  <li className="leading-6">{siteConfig.hours}</li>
                ) : null}
                {siteConfig.email ? (
                  <li>
                    <a
                      href={`mailto:${siteConfig.email}`}
                      dir="ltr"
                      className="rounded-sm break-all hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
                    >
                      {siteConfig.email}
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {legalLinks.length > 0 ? (
            <nav aria-label="اطلاعات حقوقی">
              <p className="text-sm font-semibold text-ink-900">اطلاعات</p>
              <ul role="list" className="mt-4 space-y-2.5">
                {legalLinks.map((link) =>
                  link.external ? (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-sm text-sm text-gray-600 hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
                      >
                        {link.label}
                        <span className="sr-only"> (باز شدن در پنجره جدید)</span>
                      </a>
                    </li>
                  ) : (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="rounded-sm text-sm text-gray-600 hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </nav>
          ) : null}
        </div>

        <div className="mt-12 border-t border-sand-200 pt-6">
          <p className="text-center text-xs leading-5 text-gray-500">
            © {formatFaNumber(new Date().getFullYear())} {brand.nameFa} — تمامی
            حقوق محفوظ است.
          </p>
        </div>
      </div>
      <ScrollTopButton />
    </footer>
  );
}
