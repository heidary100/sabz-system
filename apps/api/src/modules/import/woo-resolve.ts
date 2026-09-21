import { ensureUniqueSlug } from '../products/slug';
import { parseCustomAttributeLine } from '../products/attribute-parse';
import { cell, splitCell, type WooRecord } from './woo-parse';
import { WOO_SOURCE_SYSTEM, type WooReferenceData } from './woo-reference';

/**
 * Dry-run row resolution (SS-206). Pure proposal logic over parsed rows plus
 * read-only reference data — zero writes. Every verdict carries reasons so
 * the report doubles as the policy sign-off sheet (Q2–Q5).
 */

export type RowAction = 'CREATE' | 'UPDATE' | 'SKIP';
export type ProposedStatus = 'PUBLISHED' | 'DRAFT';
export type PriceClassification = 'PRICED' | 'CALL_FOR_PRICE' | 'NA';

export interface CategoryPreview {
  /** All assigned chains (deepest first). */
  chains: string[][];
  /** Deepest chain leaf (primary category candidate). */
  leaf: string | null;
  /** Path segments missing from the catalog (to-create, root first). */
  missingSegments: string[];
  /** True when the leaf is the uncategorized bucket. */
  uncategorized: boolean;
}

export interface ImagePreview {
  count: number;
  distinct: number;
  hasSecondImage: boolean;
}

export interface ContentPreview {
  hasShort: boolean;
  hasDescription: boolean;
  tagCount: number;
  attributeSlots: number;
  variantAxis: boolean;
  customLines: number;
  /** Keyless feature bullets (display list, not specs — preserved raw). */
  customBullets: number;
  /** Lines with separators but empty sides, or absurd lengths (true dirt). */
  customUnparsed: number;
  hasEnglishName: boolean;
  hasWarranty: boolean;
  hasSeo: boolean;
}

/**
 * custom_attributes line classes: `spec` (key: value, SS-202 contract),
 * `bullet` (keyless feature line — display content, preserved raw), or
 * `unparseable` (separator with an empty side, absurd length — true dirt).
 */
export type CustomLineClass = 'spec' | 'bullet' | 'unparseable';

export function classifyCustomLine(line: string): CustomLineClass | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  if (parseCustomAttributeLine(trimmed)) {
    return 'spec';
  }
  // A separator with an empty side (or absurd length) is true dirt;
  // keyless short lines are display bullets.
  if (/[:：]/.test(trimmed) || / - | – | — /.test(trimmed)) {
    return 'unparseable';
  }
  if (trimmed.length <= 200) {
    return 'bullet';
  }
  return 'unparseable';
}

export interface ResolvedRow {
  line: number;
  sourceId: string;
  sourceType: string;
  name: string;
  action: RowAction;
  reasons: string[];
  status: ProposedStatus;
  priceStatus: PriceClassification;
  hasSale: boolean;
  saleScheduled: boolean;
  isFeatured: boolean;
  sku: string | null;
  barcode: string | null;
  skuCollision: boolean;
  parentSourceKey: string | null;
  variationLink: 'none' | 'linked' | 'orphan';
  /** In-file linked variation count (variable shells; publish-gate input). */
  linkedVariations: number;
  category: CategoryPreview;
  brandName: string | null;
  brandToCreate: boolean;
  slugPreview: string;
  slugSuffixed: boolean;
  stock: number | null;
  inStockFlag: boolean;
  wholesaleOnly: boolean;
  media: ImagePreview;
  content: ContentPreview;
  /** Notable deferred-data presence (upsells, promos, video, gtin-code…). */
  flags: string[];
}

/** In-file indexes shared across rows (built in one pre-pass). */
export interface FileIndex {
  /** شناسه محصول (SKU-ish) → شناسه, for مادر linkage. */
  skuToSourceId: Map<string, string>;
  /** مادر SKU → variation count (publish-gate preview for shells). */
  variationsByMother: Map<string, number>;
  /** شناسه → row, for parent inheritance (variations carry no taxonomy). */
  rowsBySourceId: Map<string, WooRecord>;
}

export function buildFileIndex(rows: WooRecord[]): FileIndex {
  const skuToSourceId = new Map<string, string>();
  const variationsByMother = new Map<string, number>();
  const rowsBySourceId = new Map<string, WooRecord>();
  for (const row of rows) {
    const sku = cell(row, 'شناسه محصول');
    const sourceId = cell(row, 'شناسه');
    if (sku && sourceId && !skuToSourceId.has(sku)) {
      skuToSourceId.set(sku, sourceId);
    }
    if (sourceId && !rowsBySourceId.has(sourceId)) {
      rowsBySourceId.set(sourceId, row);
    }
    if (cell(row, 'نوع') === 'variation') {
      const mother = cell(row, 'مادر');
      if (mother) {
        variationsByMother.set(mother, (variationsByMother.get(mother) ?? 0) + 1);
      }
    }
  }
  return { skuToSourceId, variationsByMother, rowsBySourceId };
}

/** Claimed slugs/SKUs across the run (DB-seeded, then in-file order). */
export interface ResolverClaimants {
  slugs: Set<string>;
  skus: Set<string>;
}

export function createClaimants(refs: WooReferenceData): ResolverClaimants {
  return { slugs: new Set(refs.productSlugs), skus: new Set(refs.variantSkus) };
}

const ATTRIBUTE_SLOTS = 22;
const VARIANT_AXIS_NAME = 'انتخاب رنگ';
const BRAND_ATTR_NAME = 'برند';
const UNCATEGORIZED_NAME = 'دسته بندی نشده';

/** Assigned category chains, deepest first (ancestor redundancy collapsed). */
function parseCategoryChains(cells: Record<string, string>): string[][] {
  const get = (header: string): string => (cells[header] ?? '').trim();
  return splitCell(get('دسته‌ها'))
    .map((chain) => chain.split('>').map((part) => part.trim()).filter(Boolean))
    .filter((chain) => chain.length > 0)
    .sort((a, b) => b.length - a.length);
}

/** Path tail missing from the catalog (to-create, root first). */
function missingCategorySegments(
  chains: string[][],
  refs: WooReferenceData,
): string[] {
  if (chains.length === 0) {
    return [];
  }
  const roots = refs.categories.filter((category) => category.parentId === null);
  const childrenOf = (parentId: string): typeof refs.categories =>
    refs.categories.filter((category) => category.parentId === parentId);
  const missing: string[] = [];
  let candidates = roots;
  const chain = chains[0]!;
  for (let i = 0; i < chain.length; i += 1) {
    const match = candidates.find((category) => category.name === chain[i]);
    if (!match) {
      missing.push(...chain.slice(i));
      break;
    }
    candidates = childrenOf(match.id);
  }
  return missing;
}

/** Brand display name: برندها column wins over the برند attribute. */
function resolveBrandName(cells: Record<string, string>): string | null {
  const get = (header: string): string => (cells[header] ?? '').trim();
  const slots = attributeSlots(cells);
  const brandAttr = slots.find((slot) => slot.name === BRAND_ATTR_NAME)?.values ?? '';
  const raw =
    splitCell(get('برندها'))[0] ?? brandAttr.split(',')[0]?.trim() ?? '';
  return raw === '' ? null : raw;
}

function attributeSlots(cells: Record<string, string>): Array<{
  name: string;
  values: string;
  visible: string;
  global: string;
  def: string;
}> {
  const slots = [];
  for (let i = 1; i <= ATTRIBUTE_SLOTS; i += 1) {
    const name = (cells[`نام ${i} صفت`] ?? '').trim();
    if (!name) {
      continue;
    }
    slots.push({
      name,
      values: (cells[`مقدار(های) ${i} صفت`] ?? '').trim(),
      visible: (cells[`نمایان بودن ${i} صفت`] ?? '').trim(),
      global: (cells[`صفت ${i} سراسری`] ?? '').trim(),
      def: (cells[`پیشفرض ${i} صفت`] ?? '').trim(),
    });
  }
  return slots;
}

function parsePrice(raw: string): number | null {
  if (!raw) {
    return null;
  }
  const value = Number(raw.replace(/[,٬]/g, '').trim());
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

export async function resolveRow(
  record: WooRecord,
  refs: WooReferenceData,
  index: FileIndex,
  claimants: ResolverClaimants,
): Promise<ResolvedRow> {
  const { cells, line } = record;
  const get = (header: string): string => (cells[header] ?? '').trim();
  const reasons: string[] = [];
  const flags: string[] = [];

  const sourceId = get('شناسه');
  const sourceType = get('نوع');
  const name = get('نام');

  const fail = (reason: string): ResolvedRow => ({
    line,
    sourceId,
    sourceType,
    name,
    action: 'SKIP',
    reasons: [reason],
    status: 'DRAFT',
    priceStatus: 'NA',
    hasSale: false,
    saleScheduled: false,
    isFeatured: false,
    sku: null,
    barcode: null,
    skuCollision: false,
    parentSourceKey: null,
    variationLink: sourceType === 'variation' ? 'orphan' : 'none',
    linkedVariations: 0,
    category: { chains: [], leaf: null, missingSegments: [], uncategorized: false },
    brandName: null,
    brandToCreate: false,
    slugPreview: '',
    slugSuffixed: false,
    stock: null,
    inStockFlag: false,
    wholesaleOnly: false,
    media: { count: 0, distinct: 0, hasSecondImage: false },
    content: {
      hasShort: false,
      hasDescription: false,
      tagCount: 0,
      attributeSlots: 0,
      variantAxis: false,
      customLines: 0,
      customBullets: 0,
      customUnparsed: 0,
      hasEnglishName: false,
      hasWarranty: false,
      hasSeo: false,
    },
    flags,
  });

  if (!sourceId) {
    return fail('missing-identity: شناسه empty, no stable identity.');
  }
  if (!name) {
    return fail('missing-name: نام empty.');
  }
  if (!['simple', 'variable', 'variation'].includes(sourceType)) {
    return fail(`unknown-type: نوع=${sourceType || '<empty>'}.`);
  }
  if (get('قابل مشاهده در کاتالوگ') !== 'visible') {
    return fail('not-visible: قابل مشاهده در کاتالوگ is not visible.');
  }

  const sourceKey = `${WOO_SOURCE_SYSTEM}:${sourceId}`;
  const known = refs.sourceKeys.has(sourceKey);
  const published = get('منتشر شده') === '1';

  // Pricing (raw values reported; currency decision belongs to SS-207).
  const regular = parsePrice(get('قیمت عادی'));
  const sale = parsePrice(get('قیمت فروش ویژه'));
  const hasSale = sale !== null && regular !== null;
  const pricelessEdge = sale !== null && regular === null;
  const wholesale =
    get('متا: wholesale_customer_wholesale_price') ||
    get('متا: قیمت همکار');
  const wholesaleOnly = regular === null && !!wholesale;
  const saleScheduled = !!get('تاریخ شروع فروش ویژه') || !!get('تاریخ پایان فروش ویژه');

  // Variation linkage (مادر holds the parent SKU, not its name).
  let parentSourceKey: string | null = null;
  let variationLink: ResolvedRow['variationLink'] = 'none';
  if (sourceType === 'variation') {
    const mother = get('مادر');
    if (!mother) {
      return fail('orphan-variation: مادر empty, no parent resolvable.');
    }
    const parentId =
      index.skuToSourceId.get(mother) ??
      (refs.variantSkuToSourceKey.has(mother)
        ? refs.variantSkuToSourceKey.get(mother)!.split(':')[1]
        : undefined);
    if (!parentId) {
      return fail(`orphan-variation: مادر=${mother} absent from file and catalog.`);
    }
    parentSourceKey = `${WOO_SOURCE_SYSTEM}:${parentId}`;
    variationLink = 'linked';
  }

  // Publish proposal.
  let status: ProposedStatus = published ? 'PUBLISHED' : 'DRAFT';
  if (!published) {
    reasons.push(`draft-source: منتشر شده=${get('منتشر شده') || '<empty>'} → DRAFT.`);
  }
  const linkedVariations =
    sourceType === 'variable'
      ? (index.variationsByMother.get(get('شناسه محصول')) ?? 0)
      : 0;
  if (sourceType === 'variable') {
    if (linkedVariations === 0) {
      status = 'DRAFT';
      reasons.push('shell-without-variations: no linked variations → DRAFT (publish gate).');
    } else {
      reasons.push(`shell-with-variations: ${linkedVariations} linked variation(s).`);
    }
  }
  if (sourceType === 'variation' && !published) {
    status = 'DRAFT';
    reasons.push('variation-unpublished: kept DRAFT with its shell.');
  }

  // Price classification (Q1: visible call-for-price).
  let priceStatus: PriceClassification = 'NA';
  if (sourceType !== 'variable') {
    if (regular !== null) {
      priceStatus = 'PRICED';
    } else if (status === 'PUBLISHED') {
      priceStatus = 'CALL_FOR_PRICE';
      reasons.push(
        wholesaleOnly
          ? 'priceless-wholesale-only: no retail price, wholesale present → CALL_FOR_PRICE.'
          : 'priceless: no regular price → CALL_FOR_PRICE (Q1).',
      );
    } else {
      reasons.push('priceless-draft: price needed before publish.');
    }
  }
  if (pricelessEdge) {
    reasons.push('sale-without-regular: compareAt dropped, CALL_FOR_PRICE.');
  }

  // SKU / barcode.
  const sku = get('شناسه محصول') || null;
  const barcode = get('GTIN، UPC، EAN یا ISBN') || null;
  let skuCollision = false;
  if (sku && sourceType !== 'variable') {
    if (claimants.skus.has(sku)) {
      skuCollision = true;
      reasons.push(`sku-collision: ${sku} already taken (SS-207 dedupes).`);
    } else {
      claimants.skus.add(sku);
    }
  }

  // Categories: deepest chain wins; walk DB names for missing tail.
  // Variations carry no taxonomy (verified: 0/59 rows) — linked ones inherit
  // the parent product's chains, so the SKIP decision matches the product.
  let chains = parseCategoryChains(cells);
  if (
    chains.length === 0 &&
    variationLink === 'linked' &&
    parentSourceKey !== null
  ) {
    const parentRecord = index.rowsBySourceId.get(
      parentSourceKey.split(':')[1] ?? '',
    );
    if (parentRecord) {
      chains = parseCategoryChains(parentRecord.cells);
      if (chains.length > 0) {
        reasons.push('inherits-category: taxonomy inherited from parent shell.');
      }
    }
  }
  const leaf = chains.length > 0 ? chains[0]![chains[0]!.length - 1]! : null;
  const missingSegments = missingCategorySegments(chains, refs);
  const uncategorized = leaf === UNCATEGORIZED_NAME;
  const category: CategoryPreview = { chains, leaf, missingSegments, uncategorized };
  if (chains.length === 0) {
    reasons.push('uncategorized: دسته‌ها empty.');
  } else if (uncategorized) {
    reasons.push('uncategorized-bucket: propose SKIP (Q4).');
  } else if (missingSegments.length > 0) {
    reasons.push(`categories-to-create: ${missingSegments.join(' > ')}.`);
  }

  // Brand: variations hold no brand of their own (product-level concept).
  // A variation brand value conflicting with an in-file parent is reported;
  // otherwise brand resolves from own cells, or null (Q2) for products.
  const slots = attributeSlots(cells);
  const ownBrand = sourceType === 'variation' ? null : resolveBrandName(cells);
  if (sourceType === 'variation' && variationLink === 'linked') {
    const ownValue = resolveBrandName(cells);
    const parentRecord =
      parentSourceKey !== null
        ? index.rowsBySourceId.get(parentSourceKey.split(':')[1] ?? '')
        : undefined;
    const parentBrand = parentRecord ? resolveBrandName(parentRecord.cells) : null;
    if (ownValue !== null && parentBrand !== null && ownValue !== parentBrand) {
      reasons.push(`brand-mismatch: variation ${ownValue} vs parent ${parentBrand}.`);
      flags.push('brand-mismatch');
    }
  }
  const brandName = ownBrand;
  const brandToCreate =
    brandName !== null &&
    !refs.brands.some((brand) => brand.name === brandName);
  if (brandName === null && sourceType !== 'variation') {
    reasons.push('unbranded: no brand column/attribute → nullable (Q2).');
  } else if (brandToCreate) {
    reasons.push(`brand-to-create: ${brandName}.`);
  }

  // Slug preview (SS-205 collision helper over DB + in-file claims).
  const slugResult = await ensureUniqueSlug(
    name,
    sourceType === 'variation' ? 'variant' : 'product',
    async (slug) => claimants.slugs.has(slug),
  );
  claimants.slugs.add(slugResult.slug);

  // Stock.
  const stockRaw = get('انبار');
  const stockParsed = stockRaw === '' ? null : Number(stockRaw);
  const stock =
    stockParsed === null || !Number.isFinite(stockParsed) ? null : stockParsed;
  const inStockFlag = get('در انبار؟') === '1';

  // Media.
  const images = splitCell(get('تصاویر'));
  const media: ImagePreview = {
    count: images.length,
    distinct: new Set(images).size,
    hasSecondImage: get('متا: second_image') !== '',
  };
  if (images.length === 0 && sourceType !== 'variation') {
    reasons.push('imageless: no product images.');
  }

  // Content.
  const customLines = get('متا: custom_attributes')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  let customBullets = 0;
  let customUnparsed = 0;
  for (const line of customLines) {
    const kind = classifyCustomLine(line);
    if (kind === 'bullet') {
      customBullets += 1;
    } else if (kind === 'unparseable') {
      customUnparsed += 1;
    }
  }
  const content: ContentPreview = {
    hasShort: get('توضیح کوتاه') !== '',
    hasDescription: get('توضیحات') !== '',
    tagCount: splitCell(get('برچسب‌ها')).length,
    attributeSlots: slots.length,
    variantAxis: slots.some((slot) => slot.name === VARIANT_AXIS_NAME),
    customLines: customLines.length,
    customBullets,
    customUnparsed,
    hasEnglishName: get('متا: product_english_name') !== '',
    hasWarranty: get('متا: garrantie') !== '',
    hasSeo:
      get('متا: rank_math_description') !== '' ||
      get('متا: rank_math_focus_keyword') !== '' ||
      get('متا: rank_math_title') !== '' ||
      get('متا: _yoast_wpseo_metadesc') !== '',
  };
  if (customBullets > 0) {
    reasons.push(`custom-bullets: ${customBullets} feature line(s) preserved raw (display list).`);
  }
  if (customUnparsed > 0) {
    reasons.push(`custom-unparsed: ${customUnparsed} spec line(s) need mapping review.`);
  }

  // Deferred-data flags.
  if (get('محصولات مشابه (Cross-Sells)') || get('تشویق برای خرید بیشتر')) {
    flags.push('has-relations');
  }
  if (
    get('متا: special_offers') ||
    get('متا: inslider_special_offers') ||
    get('متا: timestamp_add_offer')
  ) {
    flags.push('has-promos');
  }
  if (get('متا: _rank_math_gtin_code')) {
    flags.push('has-gtin-code');
  }
  if (
    get('متا: product_video_code') ||
    get('متا: _product_video_url') ||
    get('متا: type_vidoe') === 'video_code'
  ) {
    flags.push('has-video');
  }
  if (get('متا: content_slider') || get('متا: des_before_price_simple_product')) {
    flags.push('has-content-fragment');
  }
  if (get('متا: _woodmart_new_label') || get('متا: _subtitle')) {
    flags.push('has-theme-label');
  }

  // Final action.
  let action: RowAction = known ? 'UPDATE' : 'CREATE';
  if (uncategorized || chains.length === 0) {
    action = 'SKIP';
  }

  return {
    line,
    sourceId,
    sourceType,
    name,
    action,
    reasons,
    status,
    priceStatus,
    hasSale,
    saleScheduled,
    isFeatured: get('آیا ویژه است؟') === '1',
    sku,
    barcode,
    skuCollision,
    parentSourceKey,
    variationLink,
    linkedVariations,
    category,
    brandName,
    brandToCreate,
    slugPreview: slugResult.slug,
    slugSuffixed: slugResult.suffixed,
    stock,
    inStockFlag,
    wholesaleOnly,
    media,
    content,
    flags,
  };
}
