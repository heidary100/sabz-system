import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { brand } from '@/lib/brand';
import { fetchProductBySlug, mediaImageUrl } from '@/lib/catalog';
import { conditionLabel } from '@/lib/condition';
import { selectOgImage } from '@/lib/product-seo';
import { seoDescriptionFromHtml } from '@/lib/seo';
import { groupSpecs, physicalSpecRows } from '@/lib/specs';
import { defaultVariantId, parseVariantParam } from '@/lib/variant';
import { RichText } from '@/components/rich-text';
import { CategoryBreadcrumb } from '@/components/ecommerce/category/category-breadcrumb';
import { ProductGallery } from '@/components/ecommerce/product-gallery/product-gallery';
import { ProductJsonLd } from '@/components/ecommerce/product/product-json-ld';
import { ProductPurchasePanel } from '@/components/ecommerce/product/product-purchase-panel';
import { ProductSpecifications } from '@/components/ecommerce/product/product-specifications';
import { RelatedProducts } from '@/components/ecommerce/product/related-products';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug);
  if (!product) {
    return { title: 'محصول یافت نشد' };
  }
  // Variant query params are UI state and never part of the canonical
  // identity: canonical, OG URL, and JSON-LD always use the clean slug URL.
  const title = product.metaTitle ?? product.name;
  const description =
    product.metaDescription ??
    product.shortDescription ??
    seoDescriptionFromHtml(product.description);
  const canonical = `/products/${product.slug}`;
  const ogImageUrl = mediaImageUrl(selectOgImage(product.media)?.url);
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
      ...(ogImageUrl ? { images: [{ url: ogImageUrl }] } : {}),
    },
  };
}

// Catalog pages render per request: build-time prerendering would either
// snapshot stale data or fail when the API is unreachable (CI).
export const dynamic = 'force-dynamic';

/** Product detail (SS-127, completed SS-214) over the public detail API. */
export default async function ProductPage({ params, searchParams }: PageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const product = await fetchProductBySlug(slug);
  if (!product) {
    notFound();
  }

  // Server-computed default keeps SSR deterministic. The panel remounts
  // (via key) whenever the variant param changes, so Back/Forward restores
  // selection without client state syncing or refetching.
  const rawVariantParam = query.variant;
  const initialVariantId = defaultVariantId(
    product.variants,
    parseVariantParam(rawVariantParam),
  );

  const trail = [
    ...product.categoryBreadcrumb,
    { name: product.name, slug: product.slug },
  ];

  const hasSpecs =
    groupSpecs(product.specs).length > 0 ||
    physicalSpecRows({
      weightKg: product.weightKg,
      widthCm: product.widthCm,
      heightCm: product.heightCm,
      depthCm: product.depthCm,
      warranty: product.warranty,
      originCountry: product.originCountry,
    }).length > 0;

  const canonicalUrl = `${siteUrl}/products/${product.slug}`;
  const jsonLdImages = product.media
    .filter((item) => item.mediaType === 'IMAGE')
    .map((item) => mediaImageUrl(item.url))
    .filter((url): url is string => url !== null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <ProductJsonLd
        product={product}
        canonicalUrl={canonicalUrl}
        imageUrls={jsonLdImages}
      />
      <CategoryBreadcrumb trail={trail} />

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <ProductGallery name={product.name} media={product.media} />

        <div>
          {product.brand ? (
            <p className="text-sm text-gray-500">{product.brand.name}</p>
          ) : null}
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
            {product.name}
          </h1>
          {product.nameEn ? (
            <p dir="auto" className="mt-1 text-sm text-gray-500">
              {product.nameEn}
            </p>
          ) : null}
          {product.subtitle ? (
            <p dir="auto" className="mt-1 text-sm leading-6 text-gray-600">
              {product.subtitle}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {product.brand ? (
              <Link
                href={`/products?brand=${encodeURIComponent(product.brand.slug)}`}
                className="rounded-full bg-sand-100 px-2.5 py-1 font-medium text-gray-600 hover:text-sabz-700"
              >
                برند: {product.brand.name}
              </Link>
            ) : null}
            <span className="rounded-full bg-sand-100 px-2.5 py-1 text-gray-600">
              {conditionLabel(product.condition)}
            </span>
          </div>

          {product.shortDescription ? (
            <p className="mt-5 text-base leading-7 text-gray-600">
              {product.shortDescription}
            </p>
          ) : null}

          <div className="mt-6">
            <ProductPurchasePanel
              key={parseVariantParam(rawVariantParam) ?? 'default'}
              variants={product.variants}
              initialVariantId={initialVariantId}
              rawVariantParam={rawVariantParam}
            />
          </div>
        </div>
      </div>

      {hasSpecs ? (
        <section aria-labelledby="specs-heading" className="mt-14">
          <h2
            id="specs-heading"
            className="text-xl font-bold tracking-tight text-ink-900"
          >
            مشخصات
          </h2>
          <div className="mt-4">
            <ProductSpecifications product={product} />
          </div>
        </section>
      ) : null}

      {product.description ? (
        <section aria-labelledby="description-heading" className="mt-14">
          <h2
            id="description-heading"
            className="text-xl font-bold tracking-tight text-ink-900"
          >
            شرح محصول
          </h2>
          <div className="mt-4 rounded-xl border border-sand-200 bg-white p-6">
            <RichText html={product.description} />
          </div>
        </section>
      ) : null}

      <RelatedProducts items={product.related} />
    </div>
  );
}
