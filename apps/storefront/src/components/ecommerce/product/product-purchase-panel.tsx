'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CatalogProductVariantDto } from '@sabz/types';
import {
  defaultVariantId,
  getSelectedVariant,
  parseVariantParam,
} from '@/lib/variant';
import { ProductPrice } from './product-price';
import { ProductPurchaseSlot } from './product-purchase-slot';
import { ProductSku } from './product-sku';
import { ProductVariantSelector } from './product-variant-selector';

/**
 * Purchase panel island (SS-214). The ONLY client state on the detail page:
 * one `selectedId` source of truth shared by the selector, price, SKU,
 * stock, and purchase slot. The page stays a server component; the gallery
 * and all content sections stay server-rendered.
 *
 * URL contract: `/products/<slug>?variant=<id>` (push on select so
 * Back/Forward restores selection; replace once to clean an invalid param).
 * Canonical identity stays `/products/<slug>`.
 */
export function ProductPurchasePanel({
  variants,
  initialVariantId,
}: {
  variants: CatalogProductVariantDto[];
  initialVariantId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(initialVariantId);
  const rawParam = searchParams.get('variant');
  const fallbackId = defaultVariantId(variants, null);

  useEffect(() => {
    if (rawParam === null) {
      // Back/forward to the clean URL restores the deterministic default.
      if (selectedId !== fallbackId) {
        setSelectedId(fallbackId);
      }
      return;
    }
    if (rawParam === selectedId) {
      return;
    }
    const parsed = parseVariantParam(rawParam);
    if (parsed !== null && variants.some((variant) => variant.id === parsed)) {
      setSelectedId(parsed);
    } else {
      // Invalid param: render stays on the valid default, clean the URL
      // once without pushing history and without redirect loops.
      router.replace(pathname, { scroll: false });
    }
  }, [rawParam, selectedId, fallbackId, variants, pathname, router]);

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

      <div className="mt-6 rounded-xl border border-sand-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-gray-600">قیمت</span>
          <span className="text-xl font-bold text-sabz-800">
            <ProductPrice variant={selected} />
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {selected.inStock ? (
            <span className="rounded-full bg-sabz-50 px-2.5 py-1 font-medium text-sabz-700">
              موجود در انبار
            </span>
          ) : (
            <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">
              ناموجود
            </span>
          )}
          {selected.priceStatus === 'CALL_FOR_PRICE' ? (
            <span className="rounded-full bg-sand-100 px-2.5 py-1 text-gray-600">
              استعلام قیمت
            </span>
          ) : null}
        </div>
        <dl className="mt-3 border-t border-sand-200 pt-3">
          <ProductSku sku={selected.sku} />
        </dl>
        <p className="mt-3 text-xs leading-5 text-gray-400">
          قیمت‌ها به تومان و برای خرید خرد است. قیمت‌گذاری همکاری در مرحله
          بعدی توسعه فعال می‌شود.
        </p>
      </div>

      <div className="mt-4">
        <ProductPurchaseSlot variant={selected} />
      </div>
    </div>
  );
}
