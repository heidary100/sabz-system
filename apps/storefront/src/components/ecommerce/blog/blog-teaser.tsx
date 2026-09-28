import { fetchBlogPosts } from '@/lib/blog';
import { BlogCard } from '@/components/ecommerce/blog/blog-card';
import { SectionHeader } from '@/components/ecommerce/ui/section-header';

/**
 * Home blog teaser (SS-238, master plan §5.10): the latest published
 * articles. Renders nothing until the first article is published
 * (no-fake-UI rule — the slot stays dormant on empty catalogs).
 */
export async function BlogTeaser() {
  let posts;
  try {
    const page = await fetchBlogPosts({ limit: 3 });
    posts = page.items;
  } catch {
    return null;
  }
  if (posts.length === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby="blog-heading"
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8"
    >
      <SectionHeader
        id="blog-heading"
        title="وبلاگ"
        subtitle="راهنماها و تازه‌های فروشگاه"
        actionHref="/blog"
      />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <BlogCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
