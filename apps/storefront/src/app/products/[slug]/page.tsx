import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { brand } from '@/lib/brand';
import { fetchProductBySlug, mediaUrl } from '@/lib/catalog';
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
import { buildSharePayload } from '@/lib/share-message';
import { formatToman } from '@/lib/format';

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
  const ogImageUrl = publicMediaUrl(selectOgImage(product.media)?.url);
  // Public social card price: base/retail values only — never a partner price.
  // The API detail projection has already rounded Rial and contains no B2B
  // fields, so this is safe to cache and share.
  const pricedVariants = product.variants.filter(
    (variant) => variant.priceStatus === 'PRICED',
  );
  const lowest = pricedVariants.reduce<typeof pricedVariants[number] | null>(
    (min, variant) =>
      min === null || Number(variant.price) < Number(min.price) ? variant : min,
    null,
  );
  const priceLabel = lowest
    ? `${pricedVariants.length > 1 ? 'از ' : ''}${formatToman(lowest.price)}`
    : null;
  const socialDescription = [description, priceLabel].filter(Boolean).join(' — ');
  return {
    title,
    description: description || undefined,
    alternates: { canonical },
    openGraph: {
      title,
      description: socialDescription || undefined,
      url: canonical,
      siteName: brand.nameFa,
      locale: 'fa_IR',
      type: 'website',
      ...(ogImageUrl
        ? { images: [{ url: ogImageUrl, alt: title }] }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: socialDescription || undefined,
      ...(ogImageUrl ? { images: [ogImageUrl] } : {}),
    },
  };
}

/** Absolute, crawler-accessible media URL (never the compose-internal host). */
function publicMediaUrl(path: string | null | undefined): string | null {
  const url = mediaUrl(path);
  if (!url) return null;
  return /^https?:/i.test(url) ? url : absoluteUrl(url);
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
  // SS-249: anonymous share payload — same price rule as listing cards
  // (call-for-price when nothing is priced, «از …» only for a real spread),
  // built from BASE variant values only; tier personalization never reaches
  // a share (guest price responses pin tierApplied=false in e2e).
  const pricedVariants = product.variants.filter(
    (variant) => variant.priceStatus === 'PRICED',
  );
  const selectedVariant =
    product.variants.find((variant) => variant.id === initialVariantId) ?? null;
  const selectedPriced =
    selectedVariant?.priceStatus === 'PRICED' ? selectedVariant : null;
  const sharePayload = buildSharePayload({
    title: product.name,
    shortDescription: product.shortDescription,
    brandName: product.brand?.name ?? null,
    variantName: selectedVariant?.name ?? null,
    imageUrl: publicMediaUrl(
      product.media.find((item) => item.mediaType === 'IMAGE')?.thumbnailUrl ??
        product.media.find((item) => item.mediaType === 'IMAGE')?.url ??
        null,
    ),
    priceFromRial: selectedPriced
      ? selectedPriced.price
      : pricedVariants.length > 0
        ? String(Math.min(...pricedVariants.map((variant) => Number(variant.price))))
        : null,
    regularPriceRial: selectedPriced?.regularPrice ?? null,
    variantCount: pricedVariants.length,
    url: canonicalUrl,
  });
  const jsonLdImages = product.media
    .filter((item) => item.mediaType === 'IMAGE')
    .map((item) => publicMediaUrl(item.url))
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
              className="inline-flex min-h-9 max-w-48 items-center truncate rounded-pill bg-surface-2 px-3 py-1.5 text-fg-secondary transition-colors duration-200 hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              ← {product.previous.name}
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          <Link
            href={`/categories/${product.category.slug}`}
            className="inline-flex min-h-9 max-w-48 items-center truncate rounded-pill bg-surface-2 px-3 py-1.5 text-fg-secondary transition-colors duration-200 hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            بازگشت به {product.category.name}
          </Link>
          {product.next ? (
            <Link
              href={`/products/${product.next.slug}`}
              className="inline-flex min-h-9 max-w-48 items-center truncate rounded-pill bg-surface-2 px-3 py-1.5 text-fg-secondary transition-colors duration-200 hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
            <p className="text-sm font-medium text-accent">{product.brand.name}</p>
          ) : null}
          <h1 className="mt-1 text-balance text-2xl font-extrabold leading-9 text-fg sm:text-3xl sm:leading-[3rem]">
            {product.name}
          </h1>
          {/* SS-227 dedup: the import often fills subtitle with the same
              string as nameEn — rendering both duplicated the line. Each
              secondary line renders only when it differs from the ones above. */}
          {product.nameEn && product.nameEn !== product.subtitle ? (
            <p dir="auto" className="mt-1 text-sm text-fg-muted">
              {product.nameEn}
            </p>
          ) : null}
          {product.subtitle && product.subtitle !== product.name ? (
            <p dir="auto" className="mt-1 text-sm leading-6 text-fg-secondary">
              {product.subtitle}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {product.brand ? (
              <Link
                href={`/products?brand=${encodeURIComponent(product.brand.slug)}`}
                className={`${badgeVariants({ variant: 'condition' })} hover:text-accent`}
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
            <p className="mt-5 text-base leading-7 text-fg-secondary">
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
            <ProductShare canonicalUrl={canonicalUrl} sharePayload={sharePayload} />
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3">
            <CompareToggle
              productId={product.id}
              slug={product.slug}
              productName={product.name}
            />
            <div className="text-sm">
              <p className="font-semibold text-fg">مقایسه با محصولات دیگر</p>
              <Link
                href="/compare"
                className="text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                مشاهده جدول مقایسه
              </Link>
            </div>
          </div>
        </div>
      </div>

      {hasSpecs ? (
        <section aria-labelledby="specs-heading" className=" mt-14">
          <h2
            id="specs-heading"
            className="text-xl font-extrabold text-fg"
          >
            مشخصات
          </h2>
          <div className="mt-4">
            <ProductSpecifications product={product} />
          </div>
        </section>
      ) : null}

      {product.description ? (
        <section aria-labelledby="description-heading" className=" mt-14">
          <h2
            id="description-heading"
            className="text-xl font-extrabold text-fg"
          >
            شرح محصول
          </h2>
          <div className="mt-4 rounded-panel border border-border bg-surface p-6 shadow-card sm:p-8">
            <RichText html={product.description} />
          </div>
        </section>
      ) : null}

      <ProductReviews productId={product.id} productSlug={product.slug} />

      <RelatedProducts items={product.related} />
    </div>
  );
}
