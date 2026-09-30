'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CatalogProductVariantDto } from '@sabz/types';
import { AddToCartButton } from '@/components/ecommerce/cart/add-to-cart-button';
import { getSelectedVariant, parseVariantParam } from '@/lib/variant';
import { CountdownTimer } from '@/components/ecommerce/ui/countdown-timer';
import { ProductPrice } from './product-price';
import { ProductPurchaseSlot } from './product-purchase-slot';
import { ProductSku } from './product-sku';
import { ProductVariantSelector } from './product-variant-selector';
import { TierPriceLine } from './tier-price-line';

/**
 * Purchase panel island (SS-214). The ONLY client state on the detail page:
 * one `selectedId` source of truth shared by the selector, price, SKU,
 * stock, and purchase slot. The page stays a server component; the gallery
 * and all content sections stay server-rendered.
 *
 * URL contract: `/products/<slug>?variant=<id>` (push on select so
 * Back/Forward restores selection; replace once to clean an invalid param).
 * Canonical identity stays `/products/<slug>`.
 *
 * Back/Forward needs no state-sync effect: the page remounts this island
 * (via `key`) whenever the variant param changes, so the server-computed
 * `initialVariantId` is always fresh. The single effect below only cleans
 * an invalid param through the router (external-system sync, never state).
 */
export function ProductPurchasePanel({
  productName,
  productSlug,
  promotionEndsAt,
  variants,
  initialVariantId,
  rawVariantParam,
}: {
  /** Product name for the add-to-cart accessible label. */
  productName: string;
  /** Product slug for the tier-aware price endpoint. */
  productSlug: string;
  /** Earliest active-promotion end (SS-235 B1); null when no sale runs. */
  promotionEndsAt: string | null;
  variants: CatalogProductVariantDto[];
  initialVariantId: string | null;
  /** Raw `?variant=` value from the URL; used only for one-time cleanup. */
  rawVariantParam: string | string[] | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedId, setSelectedId] = useState<string | null>(initialVariantId);

  const parsedParam = parseVariantParam(rawVariantParam);
  const needsUrlCleanup =
    rawVariantParam != null &&
    (parsedParam === null || parsedParam !== initialVariantId);

  useEffect(() => {
    if (needsUrlCleanup) {
      // Invalid or unknown variant param: the visible selection already
      // falls back to the deterministic default — drop the param without
      // pushing history and without redirect loops.
      router.replace(pathname, { scroll: false });
    }
  }, [needsUrlCleanup, pathname, router]);

  function handleSelect(id: string) {
    setSelectedId(id);
    router.push(`${pathname}?variant=${id}`, { scroll: false });
  }

  const selected = getSelectedVariant(variants, selectedId);
  if (!selected) {
    return null;
  }

  return (
    <div>
      <ProductVariantSelector
        variants={variants}
        selectedId={selected.id}
        onSelect={handleSelect}
      />

      <div className="mt-6 rounded-2xl border border-sand-200 bg-gradient-to-b from-sabz-50/70 to-white p-5 shadow-card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <span className="text-sm font-medium text-gray-500">قیمت</span>
          <span className="text-2xl font-black text-sabz-800 sm:text-3xl">
            <ProductPrice variant={selected} />
          </span>
        </div>
        {selected.priceStatus === 'PRICED' ? (
          <TierPriceLine
            slug={productSlug}
            variantId={selected.id}
            basePrice={selected.price}
          />
        ) : null}
        {promotionEndsAt !== null && selected.priceStatus === 'PRICED' ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-600">پایان فروش ویژه:</span>
            <CountdownTimer endsAt={promotionEndsAt} size="sm" />
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {selected.inStock ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sabz-50 px-2.5 py-1 font-semibold text-sabz-700 ring-1 ring-inset ring-sabz-200">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-sabz-500" />
              موجود در انبار
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700 ring-1 ring-inset ring-red-100">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-red-500" />
              ناموجود
            </span>
          )}
          {selected.priceStatus === 'CALL_FOR_PRICE' ? (
            <span className="rounded-full bg-sand-100 px-2.5 py-1 font-medium text-gray-600">
              استعلام قیمت
            </span>
          ) : null}
        </div>
        <dl className="mt-4 border-t border-sand-200 pt-3">
          <ProductSku sku={selected.sku} />
        </dl>
        <p className="mt-3 text-xs leading-5 text-gray-600">
          قیمت‌ها به تومان و برای خرید خرد است. همکاران تأییدشده قیمت سطح
          همکاری خود را پس از ورود، همین‌جا و در سبد خرید مشاهده می‌کنند.
        </p>
      </div>

      <div className="mt-4">
        {selected.inStock && selected.priceStatus === 'PRICED' ? (
          <AddToCartButton
            identity={{ variantId: selected.id }}
            productName={productName}
          />
        ) : (
          <ProductPurchaseSlot variant={selected} productName={productName} />
        )}
      </div>
    </div>
  );
}
