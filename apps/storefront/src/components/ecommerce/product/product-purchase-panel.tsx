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
  const [quantity, setQuantity] = useState(1);

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
    setQuantity(1);
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

      <div className="mt-6 rounded-panel border border-border bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <span className="text-sm font-medium text-fg-muted">قیمت</span>
          <span className="text-2xl font-black text-accent-hover sm:text-3xl">
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
            <span className="text-xs text-fg-secondary">پایان فروش ویژه:</span>
            <CountdownTimer endsAt={promotionEndsAt} size="sm" />
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {selected.inStock ? (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent-soft px-2.5 py-1 font-semibold text-accent ring-1 ring-inset ring-accent/20">
              <span aria-hidden="true" className="size-1.5 rounded-pill bg-accent" />
              موجود در انبار
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-danger-soft px-2.5 py-1 font-semibold text-danger ring-1 ring-inset ring-danger/20">
              <span aria-hidden="true" className="size-1.5 rounded-pill bg-danger" />
              ناموجود
            </span>
          )}
          {selected.priceStatus === 'CALL_FOR_PRICE' ? (
            <span className="rounded-pill bg-surface-2 px-2.5 py-1 font-medium text-fg-secondary">
              استعلام قیمت
            </span>
          ) : null}
        </div>
        <dl className="mt-4 border-t border-border pt-3">
          <ProductSku sku={selected.sku} />
        </dl>
        <p className="mt-3 text-xs leading-5 text-fg-secondary">
          قیمت‌ها به تومان و برای خرید خرد است. همکاران تأییدشده قیمت سطح
          همکاری خود را پس از ورود، همین‌جا و در سبد خرید مشاهده می‌کنند.
        </p>
      </div>

      {selected.inStock && selected.priceStatus === 'PRICED' ? (
        <div className="mt-4 flex flex-wrap items-end gap-4 rounded-card border border-border bg-surface p-4">
          <div>
            <p className="text-xs font-medium text-fg-muted">تعداد</p>
            <div className="mt-1.5 inline-flex items-center rounded-control border border-border-control bg-surface">
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                disabled={quantity <= 1}
                aria-label="کاهش تعداد"
                className="flex size-10 items-center justify-center text-lg text-fg-secondary hover:bg-surface-2 disabled:opacity-40"
              >
                −
              </button>
              <span
                aria-live="polite"
                className="min-w-9 text-center text-sm font-bold tabular-nums text-fg"
              >
                {quantity.toLocaleString('fa-IR')}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.min(99, value + 1))}
                disabled={quantity >= 99}
                aria-label="افزایش تعداد"
                className="flex size-10 items-center justify-center text-lg text-fg-secondary hover:bg-surface-2 disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
          <p className="flex-1 text-xs leading-5 text-fg-muted">
            موجودی و سقف مجاز در سرور بررسی می‌شود؛ در صورت تغییر، پیام دقیق
            نمایش داده می‌شود.
          </p>
        </div>
      ) : null}

      <div className="mt-4">
        {selected.inStock && selected.priceStatus === 'PRICED' ? (
          <AddToCartButton
            identity={{ variantId: selected.id }}
            productName={productName}
            quantity={quantity}
          />
        ) : (
          <ProductPurchaseSlot variant={selected} productName={productName} />
        )}
      </div>

      <ul
        role="list"
        className="mt-4 grid gap-2 rounded-card border border-border bg-surface-2/40 p-3 text-xs leading-5 text-fg-secondary sm:grid-cols-2"
      >
        <li>ارسال از انبار سبز سیستم، پس از تأیید سفارش.</li>
        <li>اصالت کالا و بسته‌بندی سالم تضمین می‌شود.</li>
        <li>امکان مرجوعی طبق شرایط فروش برای سفارش‌های واجد شرایط.</li>
        <li>پشتیبانی آنلاین برای انتخاب مدل و پیگیری سفارش.</li>
      </ul>
    </div>
  );
}
