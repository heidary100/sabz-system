import type { Metadata } from 'next';
import { fetchProductBySlug } from '@/lib/catalog';
import { parseSlugsParam } from '@/lib/compare';
import { CompareView } from './compare-view';

export const metadata: Metadata = { title: 'مقایسه محصولات' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Compare page (SS-237, server): resolves the shareable `?products=`
 * slugs through the cached catalog reads (SS-217 — no client-side catalog
 * fetching) and hands the details plus the URL identity to the client view,
 * which syncs the localStorage list with the URL.
 */
export default async function ComparePage({ searchParams }: PageProps) {
  const query = await searchParams;
  const slugs = parseSlugsParam(query.products);
  const products = (
    await Promise.all(slugs.map((slug) => fetchProductBySlug(slug)))
  ).filter((product) => product !== null);

  return (
    <CompareView
      urlSlugs={slugs}
      urlEntries={products.map((product) => ({
        id: product.id,
        slug: product.slug,
      }))}
      products={products}
    />
  );
}
