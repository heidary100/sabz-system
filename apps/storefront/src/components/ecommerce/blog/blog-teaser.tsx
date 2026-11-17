import { fetchBlogPosts } from '@/lib/blog';
import { BlogFeature } from '@/components/ecommerce/blog/blog-feature';

/**
 * Legacy independently-fetching blog teaser.
 *
 * The merchandising homepage no longer uses this component; it remains for
 * non-homepage consumers and delegates presentation to `BlogFeature`.
 */
export async function BlogTeaser() {
  let posts;
  try {
    const page = await fetchBlogPosts({ limit: 3 });
    posts = page.items;
  } catch {
    return null;
  }
  if (!posts || posts.length === 0) {
    return null;
  }
  return <BlogFeature posts={posts} />;
}
