import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { fetchBlogCategories, fetchBlogPosts } from '@/lib/blog';
import { BlogCard } from '@/components/ecommerce/blog/blog-card';

export const metadata: Metadata = {
  title: 'وبلاگ',
  description: 'راهنماهای خرید و تازه‌های فروشگاه سبز سیستم',
  alternates: { canonical: '/blog' },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Blog index (SS-238): published articles newest-first with a category
 * filter. `searchParams` is read server-side (URL-state, shareable links);
 * the reads come from the Data Cache (SS-217) — no client fetching.
 */
export default async function BlogIndexPage({ searchParams }: PageProps) {
  await connection();
  const query = await searchParams;
  const rawCategory = query.category;
  const category = Array.isArray(rawCategory) ? rawCategory[0] : rawCategory;
  const [page, categories] = await Promise.all([
    fetchBlogPosts({ limit: 12, ...(category ? { category } : {}) }),
    fetchBlogCategories(),
  ]);
  const activeCategory = categories.find((entry) => entry.slug === category) ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <nav aria-label="مسیر" className="text-xs text-fg-muted">
        <Link href="/" className="hover:text-accent">
          خانه
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">وبلاگ</span>
      </nav>
      <h1 className="mt-3 text-balance text-2xl font-extrabold text-fg">وبلاگ</h1>
      <p className="mt-1 text-sm text-fg-muted">راهنماهای خرید و تازه‌های فروشگاه</p>

      {categories.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="دسته‌بندی مطالب">
          <Link
            href="/blog"
            aria-current={category ? undefined : 'page'}
            className={`inline-flex min-h-9 items-center rounded-pill border px-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              category
                ? 'border-border bg-surface text-fg-secondary hover:border-accent hover:text-accent'
                : 'border-accent bg-accent text-on-accent'
            }`}
          >
            همه مطالب
          </Link>
          {categories.map((entry) => {
            const active = entry.slug === category;
            return (
              <Link
                key={entry.id}
                href={`/blog?category=${encodeURIComponent(entry.slug)}`}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-9 items-center rounded-pill border px-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                  active
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-border bg-surface text-fg-secondary hover:border-accent hover:text-accent'
                }`}
              >
                {entry.name}
              </Link>
            );
          })}
        </div>
      ) : null}

      {page.items.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.items.map((post) => (
            <BlogCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <p className="mt-10 text-center text-sm text-fg-muted">
          {activeCategory
            ? `در دسته‌بندی «${activeCategory.name}» هنوز مطلبی منتشر نشده است.`
            : 'هنوز مطلبی در وبلاگ منتشر نشده است.'}
        </p>
      )}
    </div>
  );
}
