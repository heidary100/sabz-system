import { fetchBlogPosts } from '@/lib/blog';
import { splitBlogTeaser } from '@/lib/home';
import { BlogCard } from '@/components/ecommerce/blog/blog-card';
import { SectionHeader } from '@/components/ecommerce/ui/section-header';

/**
 * Home blog teaser (SS-238, Task 04): one larger featured story beside two
 * compact stories — not another product grid. Renders nothing until the
 * first article is published or when the blog endpoint fails.
 */
export async function BlogTeaser() {
  let posts;
  try {
    const page = await fetchBlogPosts({ limit: 3 });
    posts = page.items;
  } catch {
    return null;
  }
  const layout = splitBlogTeaser(posts);
  if (!layout) {
    return null;
  }

  return (
    <section
      data-home-section="blog"
      aria-labelledby="blog-heading"
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
    >
      <SectionHeader
        id="blog-heading"
        title="وبلاگ"
        subtitle="راهنماها و تازه‌های فروشگاه"
        actionHref="/blog"
      />
      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        <div
          className={
            layout.secondary.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'
          }
        >
          <BlogCard post={layout.feature} variant="feature" />
        </div>
        {layout.secondary.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
            {layout.secondary.map((post) => (
              <BlogCard key={post.id} post={post} variant="compact" />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
