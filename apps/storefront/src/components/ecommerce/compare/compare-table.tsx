import type { CatalogProductDetailDto } from '@sabz/types';
import Image from 'next/image';
import Link from 'next/link';
import { AddToCartButton } from '@/components/ecommerce/cart/add-to-cart-button';
import { CompareRemoveButton } from '@/components/ecommerce/compare/compare-remove-button';
import { Badge } from '@/components/ecommerce/ui/badge';
import { CountdownTimer } from '@/components/ecommerce/ui/countdown-timer';
import { Rating } from '@/components/ecommerce/ui/rating';
import { mediaImageUrl } from '@/lib/catalog';
import { conditionLabel } from '@/lib/condition';
import { formatFaNumber, formatPriceFrom, formatToman } from '@/lib/format';
import {
  groupSpecs,
  physicalSpecRows,
  specLabelFa,
} from '@/lib/specs';

interface SpecColumn {
  rows: Map<string, string>;
}

function specColumnOf(product: CatalogProductDetailDto): SpecColumn {
  const rows = new Map<string, string>();
  for (const group of groupSpecs(product.specs)) {
    for (const row of group.rows) {
      if (!rows.has(row.key)) {
        rows.set(row.key, row.value);
      }
    }
  }
  for (const row of physicalSpecRows({
    weightKg: product.weightKg,
    widthCm: product.widthCm,
    heightCm: product.heightCm,
    depthCm: product.depthCm,
    warranty: product.warranty,
    originCountry: product.originCountry,
  })) {
    if (!rows.has(row.key)) {
      rows.set(row.key, row.value);
    }
  }
  return { rows };
}

function minPricedVariant(product: CatalogProductDetailDto): {
  price: string;
  compareAtPrice: string | null;
} | null {
  let best: { price: string; compareAtPrice: string | null } | null = null;
  for (const variant of product.variants) {
    if (variant.priceStatus !== 'PRICED') {
      continue;
    }
    if (best === null || Number(variant.price) < Number(best.price)) {
      best = { price: variant.price, compareAtPrice: variant.compareAtPrice };
    }
  }
  return best;
}

function PriceCell({ product }: { product: CatalogProductDetailDto }) {
  const best = minPricedVariant(product);
  if (!best) {
    return <Badge variant="callForPrice">استعلام قیمت</Badge>;
  }
  const pricedCount = product.variants.filter(
    (variant) => variant.priceStatus === 'PRICED',
  ).length;
  return (
    <span className="text-sm font-bold text-accent-hover">
      {pricedCount > 1 ? formatPriceFrom(best.price) : formatToman(best.price)}
    </span>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="row"
      className="sticky start-0 z-10 min-w-28 bg-surface-2 px-3 py-3 text-start text-xs font-semibold text-fg-secondary sm:min-w-36 sm:text-sm"
    >
      {children}
    </th>
  );
}

function MissingCell() {
  return (
    <td className="px-3 py-3 text-center text-sm text-fg-muted" aria-label="نامشخص">
      —
    </td>
  );
}

/**
 * Comparison table (SS-237, server). Columns are products, rows are
 * attributes: header (image/name/remove), price, rating, stock, brand,
 * condition, promotion countdown, the union of spec keys, and the purchase
 * action. Prices come from the server DTOs via the single Toman conversion
 * point; rating reuses the Rating primitive; missing spec values render «—»,
 * never invented data.
 */
export function CompareTable({
  products,
}: {
  products: CatalogProductDetailDto[];
}) {
  const columns = products.map((product) => ({
    product,
    specs: specColumnOf(product),
  }));

  const specKeys: string[] = [];
  for (const column of columns) {
    for (const key of column.specs.rows.keys()) {
      if (!specKeys.includes(key)) {
        specKeys.push(key);
      }
    }
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table
        aria-label="جدول مقایسه محصولات"
        className="w-full min-w-max border-collapse text-sm"
      >
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="sticky start-0 z-10 min-w-28 bg-surface-2 sm:min-w-36">
              <span className="sr-only">ویژگی</span>
            </th>
            {columns.map(({ product }) => {
              const image = mediaImageUrl(
                product.media.find((item) => item.mediaType === 'IMAGE')
                  ?.thumbnailUrl ??
                  product.media.find((item) => item.mediaType === 'IMAGE')
                    ?.url ??
                  null,
              );
              return (
                <th
                  key={product.id}
                  scope="col"
                  className="min-w-52 max-w-64 px-3 py-4 align-top sm:min-w-60"
                >
                  <div className="flex flex-col items-center gap-2">
                    {image ? (
                      <span className="relative block aspect-square w-28 overflow-hidden rounded-control bg-surface-2">
                        <Image
                          src={image}
                          alt=""
                          fill
                          sizes="112px"
                          className="object-cover"
                        />
                      </span>
                    ) : null}
                    <Link
                      href={`/products/${product.slug}`}
                      className="line-clamp-2 min-h-10 text-[13px] font-semibold leading-5 text-fg hover:text-accent"
                    >
                      {product.name}
                    </Link>
                    <CompareRemoveButton
                      productId={product.id}
                      productName={product.name}
                    />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <RowLabel>قیمت</RowLabel>
            {columns.map(({ product }) => (
              <td key={product.id} className="px-3 py-3 text-center">
                <PriceCell product={product} />
              </td>
            ))}
          </tr>
          <tr className="border-b border-border">
            <RowLabel>امتیاز</RowLabel>
            {columns.map(({ product }) =>
              product.ratingCount > 0 && product.ratingAverage !== null ? (
                <td key={product.id} className="px-3 py-3 text-center">
                  <Rating
                    value={product.ratingAverage}
                    count={product.ratingCount}
                  />
                </td>
              ) : (
                <MissingCell key={product.id} />
              ),
            )}
          </tr>
          <tr className="border-b border-border">
            <RowLabel>وضعیت موجودی</RowLabel>
            {columns.map(({ product }) => (
              <td key={product.id} className="px-3 py-3 text-center">
                {product.inStock ? (
                  <Badge variant="success">موجود</Badge>
                ) : (
                  <Badge variant="outOfStock">اتمام موجودی</Badge>
                )}
              </td>
            ))}
          </tr>
          <tr className="border-b border-border">
            <RowLabel>برند</RowLabel>
            {columns.map(({ product }) =>
              product.brand ? (
                <td
                  key={product.id}
                  className="px-3 py-3 text-center text-fg"
                >
                  {product.brand.name}
                </td>
              ) : (
                <MissingCell key={product.id} />
              ),
            )}
          </tr>
          <tr className="border-b border-border">
            <RowLabel>وضعیت کالا</RowLabel>
            {columns.map(({ product }) => (
              <td key={product.id} className="px-3 py-3 text-center">
                <Badge variant="condition">
                  {conditionLabel(product.condition)}
                </Badge>
              </td>
            ))}
          </tr>
          <tr className="border-b border-border">
            <RowLabel>فروش ویژه</RowLabel>
            {columns.map(({ product }) =>
              product.promotionEndsAt !== null ? (
                <td key={product.id} className="px-3 py-3 text-center">
                  <CountdownTimer endsAt={product.promotionEndsAt} size="sm" />
                </td>
              ) : (
                <MissingCell key={product.id} />
              ),
            )}
          </tr>
          {specKeys.map((key) => (
            <tr key={key} className="border-b border-border last:border-0">
              <RowLabel>{specLabelFa(key)}</RowLabel>
              {columns.map(({ product, specs }) => {
                const value = specs.rows.get(key);
                return value === undefined ? (
                  <MissingCell key={product.id} />
                ) : (
                  <td
                    key={product.id}
                    dir="auto"
                    className="max-w-64 px-3 py-3 text-center text-fg"
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <RowLabel>خرید</RowLabel>
            {columns.map(({ product }) => {
              const priced = product.variants.filter(
                (variant) => variant.priceStatus === 'PRICED',
              );
              const purchasable = product.inStock && priced.length > 0;
              if (!purchasable) {
                return <MissingCell key={product.id} />;
              }
              const identity =
                priced.length === 1 && priced[0]
                  ? { variantId: priced[0].id }
                  : { productId: product.id };
              return (
                <td key={product.id} className="px-3 py-3 text-center">
                  <AddToCartButton
                    size="icon"
                    identity={identity}
                    productName={product.name}
                  />
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      <p className="sr-only">
        {formatFaNumber(products.length)} محصول در جدول مقایسه
      </p>
    </div>
  );
}
