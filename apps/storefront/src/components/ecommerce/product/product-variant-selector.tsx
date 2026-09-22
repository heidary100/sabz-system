'use client';

import type { CatalogProductVariantDto } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import {
  groupVariantOptions,
  hasStructuredOptions,
  isValueCompatible,
  resolveVariant,
  selectionOfVariant,
} from '@/lib/variant';

/**
 * Variant selector (SS-214). Presentational: selection state and URL sync
 * live in `ProductPurchasePanel` — this component only renders the control
 * and reports choices via `onSelect`.
 *
 * Two shapes: grouped radio groups per attribute axis when every variant
 * carries structured options, otherwise a flat variant list (seed reality).
 * Out-of-stock variants stay selectable for inspection and are marked
 * «ناموجود» with text, never color alone. Single-variant sets render
 * nothing.
 */
export function ProductVariantSelector({
  variants,
  selectedId,
  onSelect,
}: {
  variants: CatalogProductVariantDto[];
  selectedId: string;
  onSelect: (variantId: string) => void;
}) {
  if (variants.length <= 1) {
    return null;
  }
  if (hasStructuredOptions(variants)) {
    return (
      <GroupedSelector
        variants={variants}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    );
  }
  return (
    <FlatSelector
      variants={variants}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
}

function GroupedSelector({
  variants,
  selectedId,
  onSelect,
}: {
  variants: CatalogProductVariantDto[];
  selectedId: string;
  onSelect: (variantId: string) => void;
}) {
  const selected = variants.find((variant) => variant.id === selectedId);
  const selection = selected ? selectionOfVariant(selected) : {};
  const groups = groupVariantOptions(variants);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <fieldset key={group.attributeSlug}>
          <legend className="mb-2 text-sm font-medium text-ink-900">
            {group.attributeName}
          </legend>
          <div className="flex flex-wrap gap-2">
            {group.values.map((entry) => {
              const checked = selection[group.attributeSlug] === entry.valueSlug;
              const compatible = isValueCompatible(
                variants,
                selection,
                group.attributeSlug,
                entry.valueSlug,
              );
              const outOfStock = entry.variantIds.every(
                (id) =>
                  !variants.find((variant) => variant.id === id)?.inStock,
              );
              return (
                <label
                  key={entry.valueSlug}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition focus-within:ring-2 focus-within:ring-sabz-600 focus-within:outline-none ${
                    checked
                      ? 'border-sabz-600 bg-sabz-50 font-semibold text-sabz-800'
                      : 'border-sand-200 bg-white text-gray-700 hover:border-sabz-300'
                  } ${compatible ? '' : 'cursor-not-allowed opacity-50'}`}
                >
                  <input
                    type="radio"
                    name={`variant-${group.attributeSlug}`}
                    value={entry.valueSlug}
                    checked={checked}
                    disabled={!compatible}
                    onChange={() => {
                      const resolved = resolveVariant(variants, {
                        ...selection,
                        [group.attributeSlug]: entry.valueSlug,
                      });
                      // Guarded: incompatible values are disabled, so a match
                      // always exists; never invent a combination.
                      if (resolved) {
                        onSelect(resolved.id);
                      }
                    }}
                    className="sr-only"
                  />
                  <span>{entry.value}</span>
                  {outOfStock ? (
                    <span className="text-xs font-normal text-red-600">
                      (ناموجود)
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function FlatSelector({
  variants,
  selectedId,
  onSelect,
}: {
  variants: CatalogProductVariantDto[];
  selectedId: string;
  onSelect: (variantId: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink-900">
        نوع محصول
      </legend>
      <div className="space-y-2">
        {variants.map((variant, index) => {
          const checked = variant.id === selectedId;
          const label = variant.name ?? `گزینه ${formatFaNumber(index + 1)}`;
          return (
            <label
              key={variant.id}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition focus-within:ring-2 focus-within:ring-sabz-600 focus-within:outline-none ${
                checked
                  ? 'border-sabz-600 bg-sabz-50 font-semibold text-sabz-800'
                  : 'border-sand-200 bg-white text-gray-700 hover:border-sabz-300'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="variant"
                  value={variant.id}
                  checked={checked}
                  onChange={() => onSelect(variant.id)}
                  className="size-4 shrink-0 accent-sabz-700"
                />
                <span>{label}</span>
                {variant.inStock ? null : (
                  <span className="text-xs font-normal text-red-600">
                    (ناموجود)
                  </span>
                )}
              </span>
              <span
                dir="ltr"
                className="shrink-0 font-mono text-xs text-gray-500"
              >
                {variant.sku}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
