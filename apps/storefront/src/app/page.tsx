import Link from 'next/link';
import { fetchCategoryTree, fetchProducts } from '@/lib/catalog';
import { ProductCard } from '@/components/ecommerce/product-card/product-card';

/**
 * Home page (SS-128): hero, featured categories with counts, and the latest
 * published products. Degrades gracefully when the catalog is empty.
 */
export default async function HomePage() {
  const [categories, latest] = await Promise.all([
    fetchCategoryTree(),
    fetchProducts({ sort: 'newest', limit: 8 }),
  ]);

  return (
    <div>
      {/* Hero — adapted from the ecommerce-v4 storefront hero idiom. */}
      <section className="border-b border-sand-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
            کالای دیجیتال، اصل و با ضمانت
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-600">
            موبایل، لوازم جانبی، کامپیوتر و گجتهای هوشمند — با قیمت ویژه برای
            همکاران عمده. از میان دسته‌بندیها محصولات مورد نظرتان را پیدا کنید.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/products"
              className="rounded-md bg-sabz-700 px-6 py-3 text-sm font-semibold text-white hover:bg-sabz-800"
            >
              مشاهده محصولات
            </Link>
            {categories.length > 0 ? (
              <Link
                href={`/categories/${categories[0]!.slug}`}
                className="rounded-md border border-sabz-200 bg-white px-6 py-3 text-sm font-semibold text-sabz-800 hover:bg-sabz-50"
              >
                {categories[0]!.name}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* Featured categories */}
      {categories.length > 0 ? (
        <section aria-labelledby="categories-heading" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 id="categories-heading" className="text-xl font-bold tracking-tight text-ink-900">
            دسته‌بندی‌ها
          </h2>
          <ul role="list" className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {categories.slice(0, 10).map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categories/${category.slug}`}
                  className="group flex h-full flex-col justify-between rounded-xl border border-sand-200 bg-white p-5 transition hover:border-sabz-300"
                >
                  <span className="text-sm font-semibold text-ink-900 group-hover:text-sabz-700">
                    {category.name}
                  </span>
                  <span className="mt-3 text-xs text-gray-500">
                    {new Intl.NumberFormat('fa-IR').format(category.publishedProductCount)} کالا
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Latest products */}
      {latest.items.length > 0 ? (
        <section aria-labelledby="latest-heading" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h2 id="latest-heading" className="text-xl font-bold tracking-tight text-ink-900">
              جدیدترین محصولات
            </h2>
            <Link href="/products?sort=newest" className="text-sm font-medium text-sabz-700 hover:text-sabz-800">
              مشاهده همه
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {latest.items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500">
            کاتالوگ محصولات بهزودی تکمیل میشود.
          </p>
        </section>
      )}
    </div>
  );
}
