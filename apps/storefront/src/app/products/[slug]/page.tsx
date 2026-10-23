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
import { Badge, badgeVariants } from '@/components/ecommerce/ui/badge';
import { Rating } from '@/components/ecommerce/ui/rating';
import { ProductConsultation } from '@/components/ecommerce/product/product-consultation';
import { ProductShare } from '@/components/ecommerce/product/product-share';
import { CompareToggle } from '@/components/ecommerce/compare/compare-toggle';
import { ProductReviews } from '@/components/ecommerce/product/product-reviews';
import { absoluteUrl } from '@/lib/site-url';

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

/**
 * Product detail (SS-127, completed SS-214) over the public detail API.
 * Reading `searchParams` (variant UI state) keeps rendering dynamic per
 * request while the catalog reads come from the Data Cache (SS-217).
 */
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

  const canonicalUrl = absoluteUrl(`/products/${product.slug}`);
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

      {/* SS-227: neighbour navigation — previous / back to category / next. */}
      {product.previous || product.next ? (
        <nav
          aria-label="ناوبری محصولات مجاور"
          className="mt-3 flex items-center justify-between gap-2 text-xs"
        >
          {product.previous ? (
            <Link
              href={`/products/${product.previous.slug}`}
              className="inline-flex min-h-9 max-w-48 items-center truncate rounded-full bg-sand-100 px-3 py-1.5 text-gray-600 transition-colors duration-200 hover:bg-sabz-50 hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
            >
              ← {product.previous.name}
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          <Link
            href={`/categories/${product.category.slug}`}
            className="inline-flex min-h-9 max-w-48 items-center truncate rounded-full bg-sand-100 px-3 py-1.5 text-gray-600 transition-colors duration-200 hover:bg-sabz-50 hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
          >
            بازگشت به {product.category.name}
          </Link>
          {product.next ? (
            <Link
              href={`/products/${product.next.slug}`}
              className="inline-flex min-h-9 max-w-48 items-center truncate rounded-full bg-sand-100 px-3 py-1.5 text-gray-600 transition-colors duration-200 hover:bg-sabz-50 hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
            >
              {product.next.name} →
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
        </nav>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <ProductGallery name={product.name} media={product.media} />

        <div className="lg:sticky lg:top-24 lg:self-start">
          {product.brand ? (
            <p className="text-sm font-medium text-sabz-600">{product.brand.name}</p>
          ) : null}
          <h1 className="mt-1 text-balance text-2xl font-extrabold leading-9 text-ink-900 sm:text-3xl sm:leading-[3rem]">
            {product.name}
          </h1>
          {/* SS-227 dedup: the import often fills subtitle with the same
              string as nameEn — rendering both duplicated the line. Each
              secondary line renders only when it differs from the ones above. */}
          {product.nameEn && product.nameEn !== product.subtitle ? (
            <p dir="auto" className="mt-1 text-sm text-gray-500">
              {product.nameEn}
            </p>
          ) : null}
          {product.subtitle && product.subtitle !== product.name ? (
            <p dir="auto" className="mt-1 text-sm leading-6 text-gray-600">
              {product.subtitle}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {product.brand ? (
              <Link
                href={`/products?brand=${encodeURIComponent(product.brand.slug)}`}
                className={`${badgeVariants({ variant: 'condition' })} hover:text-sabz-700`}
              >
                برند: {product.brand.name}
              </Link>
            ) : null}
            <Badge variant="condition">{conditionLabel(product.condition)}</Badge>
          </div>

          {/* SS-236: real aggregate stars; hidden until the first approval. */}
          {product.ratingCount > 0 && product.ratingAverage !== null ? (
            <p className="mt-3">
              <Rating value={product.ratingAverage} count={product.ratingCount} />
            </p>
          ) : null}

          {product.shortDescription ? (
            <p className="mt-5 text-base leading-7 text-gray-600">
              {product.shortDescription}
            </p>
          ) : null}

          <div className="mt-6">
            <ProductPurchasePanel
              key={parseVariantParam(rawVariantParam) ?? 'default'}
              productName={product.name}
              productSlug={product.slug}
              promotionEndsAt={product.promotionEndsAt}
              variants={product.variants}
              initialVariantId={initialVariantId}
              rawVariantParam={rawVariantParam}
            />
          </div>

          <div className="mt-4">
            <ProductConsultation />
          </div>

          <div className="mt-4">
            <ProductShare canonicalUrl={canonicalUrl} />
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-xl border border-sand-200 bg-white px-4 py-3">
            <CompareToggle
              productId={product.id}
              slug={product.slug}
              productName={product.name}
            />
            <div className="text-sm">
              <p className="font-semibold text-ink-900">مقایسه با محصولات دیگر</p>
              <Link
                href="/compare"
                className="text-sabz-700 hover:text-sabz-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
              >
                مشاهده جدول مقایسه
              </Link>
            </div>
          </div>
        </div>
      </div>

      {hasSpecs ? (
        <section aria-labelledby="specs-heading" className="reveal mt-14">
          <h2
            id="specs-heading"
            className="text-xl font-extrabold text-ink-900"
          >
            مشخصات
          </h2>
          <div className="mt-4">
            <ProductSpecifications product={product} />
          </div>
        </section>
      ) : null}

      {product.description ? (
        <section aria-labelledby="description-heading" className="reveal mt-14">
          <h2
            id="description-heading"
            className="text-xl font-extrabold text-ink-900"
          >
            شرح محصول
          </h2>
          <div className="mt-4 rounded-2xl border border-sand-200 bg-white p-6 shadow-card sm:p-8">
            <RichText html={product.description} />
          </div>
        </section>
      ) : null}

      <ProductReviews productId={product.id} productSlug={product.slug} />

      <RelatedProducts items={product.related} />
    </div>
  );
}
