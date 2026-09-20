import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CatalogProductVariantDto } from '@sabz/types';
import { fetchProductBySlug } from '@/lib/catalog';
import { CALL_FOR_PRICE_LABEL, formatFaNumber, formatToman } from '@/lib/format';
import { RichText } from '@/components/rich-text';
import { ProductGallery } from '@/components/ecommerce/product-gallery/product-gallery';

const CONDITION_LABELS: Record<string, string> = {
  NEW: 'نو',
  OPEN_BOX: 'جعبه‌باز',
  REFURBISHED: 'بازسازی‌شده',
  USED: 'کارکرده',
  STOCK_CLEARANCE: 'کلیرنس',
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug);
  if (!product) {
    return { title: 'محصول یافت نشد' };
  }
  return {
    title: product.name,
    description: product.shortDescription ?? undefined,
  };
}

/** Product detail (SS-127) over the public detail API. */
export function VariantPrice({ variant }: { variant: CatalogProductVariantDto }) {
  if (variant.priceStatus === 'CALL_FOR_PRICE') {
    return <span>{CALL_FOR_PRICE_LABEL}</span>;
  }
  return (
    <span className="flex flex-wrap items-baseline justify-end gap-x-2">
      {variant.compareAtPrice ? (
        <s className="text-xs font-normal text-gray-400">
          {formatToman(variant.compareAtPrice)}
        </s>
      ) : null}
      <span>{formatToman(variant.price)}</span>
    </span>
  );
}
// Catalog pages render per request: build-time prerendering would either
// snapshot stale data or fail when the API is unreachable (CI).
export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await fetchProductBySlug(slug);
  if (!product) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="مسیر" className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
        <Link href="/" className="hover:text-sabz-700">
          خانه
        </Link>
        {product.categoryBreadcrumb.map((crumb) => (
          <span key={crumb.slug} className="flex items-center gap-1.5">
            <span aria-hidden="true">/</span>
            <Link href={`/categories/${crumb.slug}`} className="hover:text-sabz-700">
              {crumb.name}
            </Link>
          </span>
        ))}
        <span aria-hidden="true">/</span>
        <span className="text-ink-900">{product.name}</span>
      </nav>

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <ProductGallery name={product.name} media={product.media} />

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">{product.name}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={`/products?q=${encodeURIComponent(product.brand.name)}`}
              className="rounded-full bg-sand-100 px-2.5 py-1 font-medium text-gray-600 hover:text-sabz-700"
            >
              برند: {product.brand.name}
            </Link>
            <span className="rounded-full bg-sand-100 px-2.5 py-1 text-gray-600">
              {CONDITION_LABELS[product.condition] ?? product.condition}
            </span>
            {product.inStock ? (
              <span className="rounded-full bg-sabz-50 px-2.5 py-1 font-medium text-sabz-700">
                موجود در انبار
              </span>
            ) : (
              <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">
                ناموجود
              </span>
            )}
          </div>

          {product.shortDescription ? (
            <p className="mt-5 text-base leading-7 text-gray-600">{product.shortDescription}</p>
          ) : null}

          <dl className="mt-6 space-y-2 rounded-xl border border-sand-200 bg-white p-5 text-sm">
            {product.variants.length === 1 ? (
              <div className="flex items-center justify-between">
                <dt className="text-gray-600">قیمت</dt>
                <dd className="text-xl font-bold text-sabz-800">
                  <VariantPrice variant={product.variants[0]!} />
                </dd>
              </div>
            ) : (
              product.variants.map((variant) => (
                <div key={variant.id} className="flex items-center justify-between">
                  <dt className="text-gray-600">
                    {variant.name ?? variant.sku}
                    {variant.inStock ? null : (
                      <span className="ms-2 text-xs text-red-600">(ناموجود)</span>
                    )}
                  </dt>
                  <dd className="font-semibold text-sabz-800">
                    <VariantPrice variant={variant} />
                  </dd>
                </div>
              ))
            )}
            <p className="border-t border-sand-200 pt-2 text-xs leading-5 text-gray-400">
              قیمت‌ها به تومان و برای خرید خرد است. قیمت‌گذاری همکاری در مرحله بعدی
              توسعه فعال میشود.
            </p>
          </dl>

          {product.warranty || product.originCountry ? (
            <ul role="list" className="mt-4 space-y-1.5 text-sm text-gray-600">
              {product.warranty ? (
                <li>ضمانت: {product.warranty}</li>
              ) : null}
              {product.originCountry ? (
                <li>کشور سازنده: {product.originCountry}</li>
              ) : null}
              {product.weightKg ? <li>وزن: {formatFaNumber(Number(product.weightKg))} کیلوگرم</li> : null}
            </ul>
          ) : null}

          <div className="mt-6 rounded-xl bg-sabz-50 p-4 text-sm text-sabz-800">
            خرید اینترنتی بهزودی فعال میشود؛ در حال حاضر فقط مرور کاتالوگ امکانپذیر است.
          </div>
        </div>
      </div>

      {product.description ? (
        <section aria-labelledby="description-heading" className="mt-14">
          <h2 id="description-heading" className="text-xl font-bold tracking-tight text-ink-900">
            مشخصات و توضیحات
          </h2>
          <div className="mt-4 rounded-xl border border-sand-200 bg-white p-6">
            <RichText html={product.description} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
