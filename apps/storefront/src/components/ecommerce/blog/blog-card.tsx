import Link from 'next/link';
import type { BlogPostCardDto } from '@sabz/types';

/**
 * Blog card (SS-238): cover (when supplied — never a placeholder), category
 * chip, title, excerpt, and the author/date byline. Persian-first RTL.
 * Covers are operator-provided URLs on arbitrary hosts, so they render
 * through a plain lazy `<img>` (the next/image optimizer only allow-lists
 * the API/media hosts).
 */
export function BlogCard({ post }: { post: BlogPostCardDto }) {
  return (
    <article className="hover-lift group flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card transition-colors hover:border-accent">
      {post.coverImageUrl ? (
        <Link
          href={`/blog/${post.slug}`}
          className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          tabIndex={-1}
          aria-hidden="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.coverImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-[16/9] w-full object-cover transition-transform duration-500 ease-[var(--ease-swift)] group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
          />
        </Link>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-4">
        {post.category ? (
          <Link
            href={`/blog?category=${encodeURIComponent(post.category.slug)}`}
            className="w-fit rounded-pill bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {post.category.name}
          </Link>
        ) : null}
        <h3 className="text-sm font-bold leading-6 text-fg transition-colors group-hover:text-accent">
          <Link
            href={`/blog/${post.slug}`}
            className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {post.title}
          </Link>
        </h3>
        {post.excerpt ? (
          <p className="line-clamp-2 text-xs leading-5 text-fg-muted">{post.excerpt}</p>
        ) : null}
        <p className="mt-auto flex items-center gap-2 pt-2 text-xs text-fg-muted">
          {post.authorName ? <span>{post.authorName}</span> : null}
          {post.authorName && post.publishedAt ? <span aria-hidden="true">·</span> : null}
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
