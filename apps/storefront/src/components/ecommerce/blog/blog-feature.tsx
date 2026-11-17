import type { BlogPostCardDto } from '@sabz/types'
import { splitBlogTeaser } from '@/lib/blog'
import { BlogCard } from '@/components/ecommerce/blog/blog-card'
import { SectionHeader } from '@/components/ecommerce/ui/section-header'

/**
 * Published blog feature.
 *
 * Receives the posts selected by the merchandising homepage payload; it must
 * never fetch the blog index or substitute arbitrary latest posts.
 */
export function BlogFeature({
  posts,
  id = 'blog-heading',
}: {
  posts: BlogPostCardDto[]
  id?: string
}) {
  const layout = splitBlogTeaser(posts)
  if (!layout) {
    return null
  }

  return (
    <section
      data-home-section="blog"
      aria-labelledby={id}
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
    >
      <SectionHeader
        id={id}
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
          <div className="grid content-start gap-3 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
            {layout.secondary.map((post) => (
              <BlogCard key={post.id} post={post} variant="compact" />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
