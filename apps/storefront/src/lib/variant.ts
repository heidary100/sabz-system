import type { CatalogProductVariantDto } from '@sabz/types';

/**
 * Detail-page variant state (SS-214 foundation).
 *
 * Pure, framework-independent helpers — no Next.js, React, or browser APIs.
 * The URL contract is `/products/<slug>?variant=<variant-id>` where the id is
 * the existing variant UUID. The variant parameter is UI state only; the
 * canonical product identity stays `/products/<slug>`.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accepts only UUID-style variant ids. Anything else (missing, array,
 * non-UUID string, SKU) returns null and never throws, so the page can fall
 * back to the deterministic default without 404ing the product.
 */
export function parseVariantParam(
  value: string | string[] | undefined | null,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Deterministic default selected variant id:
 * 1. valid URL-selected live variant
 * 2. first inStock && PRICED variant
 * 3. first in-stock variant (covers call-for-price with stock)
 * 4. first variant (all-OOS or single-variant fallback)
 * 5. null when there are no variants
 *
 * Variants arrive ordered (createdAt, id) from the API; first-match wins so
 * SSR output stays deterministic without re-sorting here.
 */
export function defaultVariantId(
  variants: CatalogProductVariantDto[],
  requestedVariantId: string | null,
): string | null {
  if (variants.length === 0) {
    return null;
  }
  if (requestedVariantId !== null) {
    const requested = variants.find(
      (variant) => variant.id === requestedVariantId,
    );
    if (requested) {
      return requested.id;
    }
  }
  const pricedInStock = variants.find(
    (variant) => variant.inStock && variant.priceStatus === 'PRICED',
  );
  if (pricedInStock) {
    return pricedInStock.id;
  }
  const anyInStock = variants.find((variant) => variant.inStock);
  if (anyInStock) {
    return anyInStock.id;
  }
  return variants[0]!.id;
}

/**
 * Returns the variant matching `selectedId`, falling back to the
 * deterministic default (same rules as defaultVariantId). Null only when the
 * product has no variants.
 */
export function getSelectedVariant(
  variants: CatalogProductVariantDto[],
  selectedId: string | null,
): CatalogProductVariantDto | null {
  if (variants.length === 0) {
    return null;
  }
  if (selectedId !== null) {
    const match = variants.find((variant) => variant.id === selectedId);
    if (match) {
      return match;
    }
  }
  return (
    variants.find(
      (variant) => variant.inStock && variant.priceStatus === 'PRICED',
    ) ??
    variants.find((variant) => variant.inStock) ??
    variants[0]!
  );
}

/** True when every live variant carries structured options (grouped UI). */
export function hasStructuredOptions(
  variants: CatalogProductVariantDto[],
): boolean {
  return (
    variants.length > 0 &&
    variants.every((variant) => variant.options.length > 0)
  );
}

export interface VariantOptionValue {
  value: string;
  valueSlug: string;
  /** Ids of variants carrying exactly this value on this axis. */
  variantIds: string[];
}

export interface VariantOptionGroup {
  attributeName: string;
  attributeSlug: string;
  values: VariantOptionValue[];
}

/**
 * Groups variant options by attribute axis (first-seen axis order, values in
 * first-seen order). Pure — drives the grouped selector UI and its tests.
 */
export function groupVariantOptions(
  variants: CatalogProductVariantDto[],
): VariantOptionGroup[] {
  const groups: VariantOptionGroup[] = [];
  const bySlug = new Map<string, VariantOptionGroup>();
  for (const variant of variants) {
    for (const option of variant.options) {
      let group = bySlug.get(option.attributeSlug);
      if (!group) {
        group = {
          attributeName: option.attributeName,
          attributeSlug: option.attributeSlug,
          values: [],
        };
        bySlug.set(option.attributeSlug, group);
        groups.push(group);
      }
      const existing = group.values.find(
        (entry) => entry.valueSlug === option.valueSlug,
      );
      if (existing) {
        if (!existing.variantIds.includes(variant.id)) {
          existing.variantIds.push(variant.id);
        }
      } else {
        group.values.push({
          value: option.value,
          valueSlug: option.valueSlug,
          variantIds: [variant.id],
        });
      }
    }
  }
  return groups;
}

/** Partial axis selection: attributeSlug -> valueSlug. */
export type VariantSelection = Record<string, string>;

/** Reads a variant's selection key (one entry per structured axis). */
export function selectionOfVariant(
  variant: CatalogProductVariantDto,
): VariantSelection {
  const selection: VariantSelection = {};
  for (const option of variant.options) {
    selection[option.attributeSlug] = option.valueSlug;
  }
  return selection;
}

/**
 * Resolves an exact combination to a concrete variant using only the real
 * variant set — never invents combinations. Returns null when no variant
 * matches every selected axis.
 */
export function resolveVariant(
  variants: CatalogProductVariantDto[],
  selection: VariantSelection,
): CatalogProductVariantDto | null {
  const entries = Object.entries(selection);
  if (entries.length === 0) {
    return null;
  }
  return (
    variants.find((variant) =>
      entries.every(([slug, valueSlug]) =>
        variant.options.some(
          (option) =>
            option.attributeSlug === slug && option.valueSlug === valueSlug,
        ),
      ),
    ) ?? null
  );
}

/**
 * Whether choosing `valueSlug` on `groupSlug` (keeping the other selected
 * axes) still resolves to a real variant. Drives the disabled state of
 * option values — no combinatorial guessing.
 */
export function isValueCompatible(
  variants: CatalogProductVariantDto[],
  selection: VariantSelection,
  groupSlug: string,
  valueSlug: string,
): boolean {
  const next: VariantSelection = { ...selection, [groupSlug]: valueSlug };
  return resolveVariant(variants, next) !== null;
}
