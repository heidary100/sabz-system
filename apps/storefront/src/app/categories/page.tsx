import type { Metadata } from 'next';
import { connection } from 'next/server';
import Link from 'next/link';
import { fetchCategoryTree } from '@/lib/catalog';
import { navRoots } from '@/lib/nav';
import { CategoryBreadcrumb } from '@/components/ecommerce/category/category-breadcrumb';
import { CategoryTile } from '@/components/ecommerce/category/category-tile';

export const metadata: Metadata = {
  title: 'دسته‌بندی‌ها',
  description: 'مرور همه دسته‌بندی‌های کالای دیجیتال سبز سیستم.',
};

/**
 * Category index (SS-211): every browsable root as a tile, no truncation.
 * `connection()` keeps rendering at request time (build-time prerendering
 * would snapshot stale data or fail when the API is unreachable in CI)
 * without `force-dynamic`, which would disable the Data Cache (SS-217).
 */
export default async function CategoriesPage() {
  await connection();
  const categories = await fetchCategoryTree();
  // The real tree hides behind a sole root — unwrap it like the header nav.
  const roots = navRoots(categories);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <CategoryBreadcrumb trail={[{ name: 'دسته‌بندی‌ها', slug: 'دسته‌بندی‌ها' }]} />
      <div className="mt-4">
        <p className="text-sm text-gray-500">فروشگاه</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">دسته‌بندی‌ها</h1>
      </div>

      {roots.length === 0 ? (
        <div className="mt-8 rounded-xl border border-sand-200 bg-white px-6 py-20 text-center">
          <h2 className="text-lg font-semibold text-ink-900">دسته‌بندی‌ای ثبت نشده است</h2>
          <p className="mt-2 text-sm text-gray-500">
            کاتالوگ محصولات به‌زودی تکمیل می‌شود.
          </p>
          <Link
            href="/products"
            className="mt-6 inline-block rounded-md bg-sabz-700 px-6 py-3 text-sm font-semibold text-white hover:bg-sabz-800"
          >
            مشاهده محصولات
          </Link>
        </div>
      ) : (
        <ul role="list" className="stagger mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roots.map((category) => (
            <CategoryTile key={category.id} category={category} />
          ))}
        </ul>
      )}
    </div>
  );
}
