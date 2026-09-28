import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { brand } from '@/lib/brand';
import { fetchBlogPostBySlug } from '@/lib/blog';
import { seoDescriptionFromHtml } from '@/lib/seo';
import { RichText } from '@/components/rich-text';
import { ProductShare } from '@/components/ecommerce/product/product-share';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Blog article (SS-238): a published post with SEO metadata, BlogPosting
 * JSON-LD, the shared share row, and the sanitized body through RichText.
 * Drafts 404 exactly like missing slugs (the API never leaks them).
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchBlogPostBySlug(slug);
  if (!post) {
    return { title: 'مطلب یافت نشد' };
  }
  const title = post.metaTitle ?? post.title;
  const description =
    post.metaDescription ?? post.excerpt ?? seoDescriptionFromHtml(post.content);
  const canonical = `/blog/${post.slug}`;
  return {
    title,
    description: description || undefined,
    alternates: { canonical },
    openGraph: {
      title,
      description: description || undefined,
      url: canonical,
      siteName: brand.nameFa,
      locale: 'fa_IR',
      type: 'article',
      ...(post.publishedAt ? { publishedTime: post.publishedAt } : {}),
      ...(post.authorName ? { authors: [post.authorName] } : {}),
      ...(post.coverImageUrl ? { images: [{ url: post.coverImageUrl }] } : {}),
    },
  };
}

export default async function BlogArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const post = await fetchBlogPostBySlug(slug);
  if (!post) {
    notFound();
  }

  const canonicalUrl = new URL(`/blog/${post.slug}`, siteUrl).toString();
  const description =
    post.metaDescription ?? post.excerpt ?? seoDescriptionFromHtml(post.content);
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    url: canonicalUrl,
    ...(description ? { description } : {}),
    ...(post.coverImageUrl ? { image: [post.coverImageUrl] } : {}),
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    ...(post.authorName
      ? { author: { '@type': 'Person', name: post.authorName } }
      : {}),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="مسیر" className="text-xs text-gray-500">
        <Link href="/" className="hover:text-sabz-700">
          خانه
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href="/blog" className="hover:text-sabz-700">
          وبلاگ
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{post.title}</span>
      </nav>

      <article>
        {post.category ? (
          <Link
            href={`/blog?category=${encodeURIComponent(post.category.slug)}`}
            className="mt-4 inline-block rounded-full bg-sabz-50 px-2.5 py-0.5 text-xs font-medium text-sabz-700 hover:text-sabz-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
          >
            {post.category.name}
          </Link>
        ) : null}
        <h1 className="mt-2 text-2xl font-bold leading-9 tracking-tight text-ink-900 sm:text-3xl sm:leading-11">
          {post.title}
        </h1>
        <p className="mt-3 flex items-center gap-2 text-xs text-gray-400">
          {post.authorName ? <span>{post.authorName}</span> : null}
          {post.authorName && post.publishedAt ? <span aria-hidden="true">·</span> : null}
          {post.publishedAt ? (
            <time dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString('fa-IR')}
            </time>
          ) : null}
        </p>

        {post.coverImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={post.coverImageUrl}
            alt=""
            loading="eager"
            decoding="async"
            className="mt-6 aspect-[16/9] w-full rounded-xl border border-sand-200 object-cover"
          />
        ) : null}

        <div className="mt-6">
          <RichText html={post.content} />
        </div>
      </article>

      <div className="mt-8 border-t border-sand-200 pt-6">
        <ProductShare canonicalUrl={canonicalUrl} />
      </div>
    </div>
  );
}
