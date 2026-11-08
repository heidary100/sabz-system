import Link from 'next/link';
import type { BlogPostCardDto } from '@sabz/types';

type BlogCardVariant = 'default' | 'feature' | 'compact';

/**
 * Blog card (SS-238, Task 04): cover (when supplied — never a placeholder),
 * category chip, title, excerpt, and the author/date byline. Persian-first
 * RTL. Covers are operator-provided URLs on arbitrary hosts, so they render
 * through a plain lazy `<img>` (the next/image optimizer only allow-lists the
 * API/media hosts).
 *
 * Three deliberate densities: the home feature story, its two compact
 * companions, and the default index card.
 */
export function BlogCard({
  post,
  variant = 'default',
}: {
  post: BlogPostCardDto;
  variant?: BlogCardVariant;
}) {
  const feature = variant === 'feature';
  const compact = variant === 'compact';

  return (
    <article
      className={`group flex h-full overflow-hidden border border-border bg-surface transition-colors hover:border-accent ${
        compact
          ? 'gap-3 rounded-card p-3'
          : 'flex-col rounded-card shadow-card'
      }`}
    >
      {post.coverImageUrl ? (
        <Link
          href={`/blog/${post.slug}`}
          className={`block shrink-0 overflow-hidden bg-plate focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
            compact ? 'w-24 rounded-control sm:w-28' : ''
          }`}
          tabIndex={-1}
          aria-hidden="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.coverImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className={`w-full object-cover transition-transform duration-500 ease-[var(--ease-swift)] group-hover:scale-[1.04] motion-reduce:group-hover:scale-100 ${
              compact ? 'aspect-square' : feature ? 'aspect-[16/9]' : 'aspect-[16/9]'
            }`}
          />
        </Link>
      ) : null}

      <div
        className={`flex flex-1 flex-col gap-2 ${
          compact ? 'min-w-0 py-0.5' : feature ? 'p-5 sm:p-6' : 'p-4'
        }`}
      >
        {post.category ? (
          <Link
            href={`/blog?category=${encodeURIComponent(post.category.slug)}`}
            className="w-fit rounded-pill bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {post.category.name}
          </Link>
        ) : null}

        <h3
          className={`font-bold leading-6 text-fg transition-colors group-hover:text-accent ${
            feature
              ? 'text-balance text-lg sm:text-xl sm:leading-8'
              : compact
                ? 'text-[13px] leading-5'
                : 'text-sm'
          }`}
        >
          <Link
            href={`/blog/${post.slug}`}
            className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {post.title}
          </Link>
        </h3>

        {post.excerpt && !compact ? (
          <p
            className={`text-xs leading-5 text-fg-muted ${
              feature ? 'line-clamp-3 sm:text-sm sm:leading-6' : 'line-clamp-2'
            }`}
          >
            {post.excerpt}
          </p>
        ) : null}

        <p className="mt-auto flex items-center gap-2 pt-2 text-xs text-fg-muted">
          {post.authorName ? <span>{post.authorName}</span> : null}
          {post.authorName && post.publishedAt ? (
            <span aria-hidden="true">·</span>
          ) : null}
          {post.publishedAt ? (
            <time dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString('fa-IR')}
            </time>
          ) : null}
        </p>
      </div>
    </article>
  );
}
