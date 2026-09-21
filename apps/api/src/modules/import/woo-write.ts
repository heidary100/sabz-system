import { createHash } from 'node:crypto';
import { parseCustomAttributeLine } from '../products/attribute-parse';
import { sanitizeRichText } from '../products/description-sanitize';
import { cell, splitCell, type WooRecord } from './woo-parse';
import { classifyCustomLine, type ResolvedRow } from './woo-resolve';

/**
 * Row-plan builder for the SS-207 product writer (pure, no database access).
 *
 * Takes a parsed WooCommerce row plus its SS-206 dry-run verdict and derives
 * the normalized write plan the runner executes inside a per-product
 * transaction. Currency rule O-1: CSV values are Rial and are written
 * verbatim (no conversion). Unbranded rows carry `brandName: null` (Q2);
 * category chains carry the deepest-first paths (Q5: leaf wins).
 */

export const WOO_VARIANT_AXIS_NAME = 'انتخاب رنگ';
const WOO_BRAND_ATTR_NAME = 'برند';
const ATTRIBUTE_SLOTS = 22;
const IMPORT_ACTOR = 'woo-import';

export type PlanPriceStatus = 'PRICED' | 'CALL_FOR_PRICE';

export interface AttributeSlot {
  name: string;
  values: string;
  visible: string;
  global: string;
  def: string;
}

export interface SpecPlan {
  /** Attribute display name (namespace stripped for dotted names). */
  name: string;
  /** Dotted-namespace group label (`مشخصات کلی` in `مشخصات کلی.وزن`). */
  group: string | null;
  isGlobal: boolean;
  value: string;
  /** Parser provenance: WOO_ATTR (numbered slot) or WOO_CUSTOM (free text). */
  source: 'WOO_ATTR' | 'WOO_CUSTOM';
}

export interface VariantAxisPlan {
  name: string;
  value: string;
}

export interface MediaPlan {
  url: string;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductPlan {
  sourceId: string;
  sourceType: string;
  /** `WOOCOMMERCE:<parent شناسه>` for variation rows; null otherwise. */
  parentSourceKey: string | null;
  name: string;
  /** Proposed status from the verdict (runner re-gates shells on variants). */
  status: 'PUBLISHED' | 'DRAFT';
  priceStatus: PlanPriceStatus;
  /** Rial, verbatim per O-1. '0' for CALL_FOR_PRICE rows. */
  price: string;
  compareAtPrice: string | null;
  sku: string | null;
  barcode: string | null;
  stockQty: number;
  /** Deepest-first category chains; the leaf of chains[0] is primary (Q5). */
  categoryChains: string[][];
  /** Null for unbranded rows (Q2: nullable, no synthetic brand). */
  brandName: string | null;
  tags: string[];
  /** Non-axis numbered-slot specs for the (parent) product. */
  specs: SpecPlan[];
  /** Free-text custom_attributes specs for the (parent) product. */
  customSpecs: SpecPlan[];
  /** Variant-axis assignments for this row's own variant (if any). */
  variantAxes: VariantAxisPlan[];
  /** Non-axis slot specs on a variation row: attach to the parent product. */
  parentSpecs: SpecPlan[];
  customParentSpecs: SpecPlan[];
  media: MediaPlan[];
  shortDescription: string | null;
  description: string | null;
  warranty: string | null;
  nameEn: string | null;
  subtitle: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  focusKeyword: string | null;
  weightKg: string | null;
  widthCm: string | null;
  heightCm: string | null;
  depthCm: string | null;
  actor: string;
}

/** Rial parser (SS-207, O-1): raw source units, verbatim. Mirrors resolve. */
export function parseWooPrice(raw: string): number | null {
  if (!raw) {
    return null;
  }
  const value = Number(raw.replace(/[,٬]/g, '').trim());
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

/** Canonical per-row hash for resume/change detection (key order stable). */
export function buildRowHash(cells: Record<string, string>): string {
  const canonical = JSON.stringify(
    Object.keys(cells)
      .sort()
      .map((key) => [key, cells[key]]),
  );
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Short Persian message for per-row failure records. */
export function faError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'P2002') {
      return 'رکورد تکراری است؛ واردات این ردیف ناموفق بود.';
    }
    if (code === 'P2025') {
      return 'رکورد مرتبط یافت نشد؛ واردات این ردیف ناموفق بود.';
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'خطای نامشخص در واردات این ردیف.';
}

export function readAttributeSlots(cells: Record<string, string>): AttributeSlot[] {
  const get = (header: string): string => (cells[header] ?? '').trim();
  const slots: AttributeSlot[] = [];
  for (let i = 1; i <= ATTRIBUTE_SLOTS; i += 1) {
    const name = get(`نام ${i} صفت`);
    if (!name) {
      continue;
    }
    slots.push({
      name,
      values: get(`مقدار(های) ${i} صفت`),
      visible: get(`نمایان بودن ${i} صفت`),
      global: get(`صفت ${i} سراسری`),
      def: get(`پیشفرض ${i} صفت`),
    });
  }
  return slots;
}

/** Split a dotted attribute name (`namespace.name`) into group + name. */
export function splitDottedName(name: string): { group: string | null; name: string } {
  const at = name.indexOf('.');
  if (at <= 0) {
    return { group: null, name };
  }
  const group = name.slice(0, at).trim();
  const rest = name.slice(at + 1).trim();
  if (!group || !rest) {
    return { group: null, name };
  }
  return { group, name: rest };
}

function parseDecimal(raw: string, fractionDigits: number): string | null {
  const value = Number(raw.replace(/[,٬]/g, '').trim());
  if (raw.trim() === '' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value.toFixed(fractionDigits).replace(/\.?0+$/, '');
}

function cleanText(value: string, max: number): string | null {
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) {
    return null;
  }
  return text.slice(0, max);
}

/**
 * Derive the write plan for one row. SKIP verdicts return null (the runner
 * records them without touching the catalog). Variation rows return a plan
 * whose product-level collections target the parent shell.
 */
export function buildProductPlan(
  record: WooRecord,
  verdict: ResolvedRow,
): ProductPlan | null {
  if (verdict.action === 'SKIP') {
    return null;
  }
  const { cells } = record;
  const get = (header: string): string => (cells[header] ?? '').trim();
  const isVariation = verdict.sourceType === 'variation';

  const regular = parseWooPrice(get('قیمت عادی'));
  const sale = parseWooPrice(get('قیمت فروش ویژه'));
  const priced = verdict.priceStatus === 'PRICED';
  // WooCommerce sale semantics: قیمت فروش ویژه is the discounted price, so a
  // live sale (0 < sale < regular) writes price=sale + compareAt=regular.
  // Any other combination keeps price=regular (compareAt dropped when it
  // cannot satisfy the compareAt>price invariant); priceless rows become
  // visible CALL_FOR_PRICE with price '0' (Q1, O-1 Rial verbatim).
  let price = '0';
  let compareAtPrice: string | null = null;
  if (priced && regular !== null) {
    if (sale !== null && sale < regular) {
      price = String(sale);
      compareAtPrice = String(regular);
    } else {
      price = String(regular);
    }
  }

  const stockQty =
    verdict.stock !== null && Number.isFinite(verdict.stock) && verdict.stock > 0
      ? Math.floor(verdict.stock)
      : 0;

  const slots = readAttributeSlots(cells);
  const specs: SpecPlan[] = [];
  const variantAxes: VariantAxisPlan[] = [];
  const parentSpecs: SpecPlan[] = [];
  for (const slot of slots) {
    if (slot.name === WOO_BRAND_ATTR_NAME) {
      continue;
    }
    if (slot.name === WOO_VARIANT_AXIS_NAME) {
      // Variant axis (runner attaches to this row's variant; variable shells
      // carry no variant so their axes are ignored at write time).
      for (const value of slot.values.split(',').map((v) => v.trim()).filter(Boolean)) {
        variantAxes.push({ name: slot.name, value });
      }
      continue;
    }
    const { group, name } = splitDottedName(slot.name);
    for (const value of slot.values.split(',').map((v) => v.trim()).filter(Boolean)) {
      const spec: SpecPlan = {
        name,
        group,
        isGlobal: slot.global === '1',
        value,
        source: 'WOO_ATTR',
      };
      if (isVariation) {
        parentSpecs.push(spec);
      } else {
        specs.push(spec);
      }
    }
  }

  const customLines = get('متا: custom_attributes')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const customSpecs: SpecPlan[] = [];
  const customParentSpecs: SpecPlan[] = [];
  for (const line of customLines) {
    if (classifyCustomLine(line) !== 'spec') {
      continue;
    }
    const parsed = parseCustomAttributeLine(line);
    if (!parsed) {
      continue;
    }
    const { group, name } = splitDottedName(parsed.key);
    const spec: SpecPlan = {
      name,
      group,
      isGlobal: false,
      value: parsed.value,
      source: 'WOO_CUSTOM',
    };
    if (isVariation) {
      customParentSpecs.push(spec);
    } else {
      customSpecs.push(spec);
    }
  }

  const imageUrls = splitCell(get('تصاویر'));
  const secondImage = get('متا: second_image');
  if (secondImage && !imageUrls.includes(secondImage)) {
    imageUrls.splice(1, 0, secondImage);
  }
  const media: MediaPlan[] = [...new Set(imageUrls)].map((url, index) => ({
    url,
    sortOrder: index,
    isPrimary: index === 0,
  }));

  const shortRaw = get('توضیح کوتاه').trim();
  const shortPlain = sanitizeRichText(shortRaw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const long = sanitizeRichText(get('توضیحات')) || null;
  const weightRaw = Number(get('وزن (گرم)'));

  return {
    sourceId: verdict.sourceId,
    sourceType: verdict.sourceType,
    parentSourceKey: verdict.parentSourceKey,
    name: verdict.name,
    status: verdict.status,
    priceStatus: verdict.priceStatus === 'PRICED' ? 'PRICED' : 'CALL_FOR_PRICE',
    price,
    compareAtPrice,
    sku: verdict.sku,
    barcode: cell(record, 'GTIN، UPC، EAN یا ISBN') || null,
    stockQty,
    categoryChains: verdict.category.chains,
    brandName: isVariation ? null : verdict.brandName,
    tags: splitCell(get('برچسب‌ها')),
    specs,
    customSpecs,
    variantAxes,
    parentSpecs,
    customParentSpecs,
    media,
    shortDescription: shortPlain ? shortPlain.slice(0, 500) : null,
    description: long,
    warranty: cleanText(get('متا: garrantie'), 255),
    nameEn: cleanText(get('متا: product_english_name'), 255),
    subtitle: cleanText(get('متا: newkala_subtitle_product'), 255),
    metaTitle: cleanText(get('متا: rank_math_title'), 255),
    metaDescription: cleanText(
      get('متا: rank_math_description') || get('متا: _yoast_wpseo_metadesc'),
      500,
    ),
    focusKeyword: cleanText(get('متا: rank_math_focus_keyword'), 255),
    weightKg:
      Number.isFinite(weightRaw) && weightRaw > 0
        ? parseDecimal(String(weightRaw / 1000), 3)
        : null,
    widthCm: parseDecimal(get('پهنا (سانتیمتر)'), 2),
    heightCm: parseDecimal(get('بلندا (سانتیمتر)'), 2),
    depthCm: parseDecimal(get('درازا (سانتیمتر)'), 2),
    actor: IMPORT_ACTOR,
  };
}
