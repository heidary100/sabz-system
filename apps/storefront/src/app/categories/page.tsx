import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchCategoryTree } from '@/lib/catalog';
import { CategoryTile } from '@/components/ecommerce/category/category-tile';

export const metadata: Metadata = {
  title: 'دسته‌بندی‌ها',
  description: 'مرور همه دسته‌بندی‌های کالای دیجیتال سبز سیستم.',
};

// Catalog pages render per request: build-time prerendering would either
// snapshot stale data or fail when the API is unreachable (CI).
export const dynamic = 'force-dynamic';

/** Category index (SS-211): every top-level category as a tile, no truncation. */
export default async function CategoriesPage() {
  const categories = await fetchCategoryTree();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm text-gray-500">فروشگاه</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">دسته‌بندی‌ها</h1>
      </div>

      {categories.length === 0 ? (
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
        <ul role="list" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <CategoryTile key={category.id} category={category} />
          ))}
        </ul>
      )}
    </div>
  );
}
