import Link from 'next/link';
import type { CatalogCategoryNode } from '@sabz/types';
import { BrandLockup } from '@/components/ecommerce/brand/brand-lockup';

/**
 * Storefront footer (SS-124): brand blurb, category links and static-page
 * placeholders. Adapted from the ecommerce-v4 footer idiom (Tailwind Plus).
 */
export function SiteFooter({ categories }: { categories: CatalogCategoryNode[] }) {
  return (
    <footer className="mt-16 border-t border-sand-200 bg-sand-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <BrandLockup wordmarkClassName="text-base font-bold text-sabz-800" />
            <p className="mt-3 text-sm leading-6 text-gray-600">
              فروشگاه آنلاین کالای دیجیتال و لوازم جانبی در مازندران — برای
              مشتریان خرد و همکاران.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink-900">دسته‌بندی‌ها</p>
            <ul role="list" className="mt-4 space-y-2.5">
              {categories.slice(0, 5).map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/categories/${category.slug}`}
                    className="text-sm text-gray-600 hover:text-sabz-700"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
              {categories.length === 0 ? (
                <li className="text-sm text-gray-400">به‌زودی</li>
              ) : (
                <li>
                  <Link
                    href="/categories"
                    className="text-sm font-medium text-sabz-700 hover:text-sabz-800"
                  >
                    همه دسته‌بندی‌ها
                  </Link>
                </li>
              )}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink-900">فروشگاه</p>
            <ul role="list" className="mt-4 space-y-2.5">
              <li>
                <Link href="/products" className="text-sm text-gray-600 hover:text-sabz-700">
                  همه محصولات
                </Link>
              </li>
              <li>
                <Link href="/cart" className="text-sm text-gray-600 hover:text-sabz-700">
                  سبد خرید
                </Link>
              </li>
              <li>
                <Link href="/account" className="text-sm text-gray-600 hover:text-sabz-700">
                  حساب کاربری
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink-900">اطلاعات</p>
            <ul role="list" className="mt-4 space-y-2.5">
              <li>
                <Link href="/about" className="text-sm text-gray-600 hover:text-sabz-700">
                  درباره ما
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm text-gray-600 hover:text-sabz-700">
                  تماس با ما
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-gray-600 hover:text-sabz-700">
                  قوانین و مقررات
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-sand-200 pt-6">
          <p className="text-center text-xs leading-5 text-gray-500">
            © {new Intl.DateTimeFormat('fa-IR', { year: 'numeric' }).format(new Date())} سبز
            سیستم — تمامی حقوق محفوظ است.
          </p>
        </div>
      </div>
    </footer>
  );
}
