import { classifyHeaders } from './woo-columns';
import type { ResolvedRow } from './woo-resolve';

/**
 * Dry-run report aggregation (SS-206).
 *
 * The report is the policy sign-off sheet: every number the user must
 * approve before SS-207 writes anything, plus per-row verdicts for audit.
 * Serialized to JSON (artifact) and rendered as a human summary (stdout).
 */

export interface DryRunReport {
  generatedAt: string;
  file: string;
  rows: number;
  reference: { categories: number; brands: number; knownSourceKeys: number };
  columns: { total: number; mapped: number; deferred: number; ignored: number; fallback: string[] };
  byAction: Record<string, number>;
  byType: Record<string, number>;
  published: number;
  drafts: number;
  priceless: number;
  wholesaleOnly: number;
  onSale: number;
  saleScheduled: number;
  featured: number;
  orphanVariations: number;
  shellDrafts: number;
  unbranded: number;
  brandsToCreate: string[];
  categoriesToCreate: string[];
  imageless: number;
  images: { refs: number; distinct: string[] };
  slugCollisions: number;
  skuCollisions: number;
  customBullets: number;
  customUnparsedLines: number;
  flags: Record<string, number>;
  /** Open questions requiring sign-off before the writer runs. */
  decisions: string[];
  verdicts: ResolvedRow[];
}

const DECISIONS = [
  'Q1 decided: priceless published rows import as visible CALL_FOR_PRICE (non-purchasable).',
  'Q2 proposed: unbranded rows import with nullable brand (no synthetic brand).',
  'Q3 proposed: non-published rows import as DRAFT (admin-visible, storefront-hidden).',
  'Q4 proposed: rows without any category (10) and uncategorized-bucket rows (6) are SKIPPED, never imported as a storefront category.',
  'Q5 proposed: single primary category accepted for M2 (secondary join is P1).',
  'OPEN: CSV prices are raw source units — SS-207 must lock the Rial/Toman rule before writing.',
  'OPEN: brand candidates mix Persian/English spellings of the same brand (e.g. adata/ای دیتا) — SS-207 needs an alias-reconciliation pass.',
  'OPEN: near-duplicate category segments (e.g. ابزار/ابزار آلات/ابزارآلات) need a merge review before import.',
];

export function buildReport(
  file: string,
  header: string[],
  verdicts: ResolvedRow[],
  reference: { categories: number; brands: number; knownSourceKeys: number },
): DryRunReport {
  const columns = classifyHeaders(header);
  const byAction: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const flags: Record<string, number> = {};
  const brandsToCreate = new Set<string>();
  const categoriesToCreate = new Set<string>();
  let published = 0;
  let drafts = 0;
  let priceless = 0;
  let wholesaleOnly = 0;
  let onSale = 0;
  let saleScheduled = 0;
  let featured = 0;
  let orphanVariations = 0;
  let shellDrafts = 0;
  let unbranded = 0;
  let imageless = 0;
  let imageRefs = 0;
  let slugCollisions = 0;
  let skuCollisions = 0;
  let customBullets = 0;
  let customUnparsedLines = 0;

  for (const verdict of verdicts) {
    byAction[verdict.action] = (byAction[verdict.action] ?? 0) + 1;
    byType[verdict.sourceType] = (byType[verdict.sourceType] ?? 0) + 1;
    if (verdict.status === 'PUBLISHED') {
      published += 1;
    } else {
      drafts += 1;
    }
    if (verdict.priceStatus === 'CALL_FOR_PRICE') {
      priceless += 1;
    }
    if (verdict.wholesaleOnly) {
      wholesaleOnly += 1;
    }
    if (verdict.hasSale) {
      onSale += 1;
    }
    if (verdict.saleScheduled) {
      saleScheduled += 1;
    }
    if (verdict.isFeatured) {
      featured += 1;
    }
    if (verdict.variationLink === 'orphan') {
      orphanVariations += 1;
    }
    if (
      verdict.sourceType === 'variable' &&
      verdict.linkedVariations === 0 &&
      verdict.action !== 'SKIP'
    ) {
      shellDrafts += 1;
    }
    // Brand/gallery metrics are product-level (simple + variable):
    // variations inherit both from their shell.
    if (verdict.sourceType !== 'variation' && verdict.brandName === null) {
      unbranded += 1;
    } else if (verdict.brandToCreate && verdict.brandName !== null) {
      brandsToCreate.add(verdict.brandName);
    }
    for (const segment of verdict.category.missingSegments) {
      categoriesToCreate.add(segment);
    }
    if (verdict.sourceType !== 'variation' && verdict.media.count === 0) {
      imageless += 1;
    }
    imageRefs += verdict.media.count;
    if (verdict.slugSuffixed) {
      slugCollisions += 1;
    }
    if (verdict.skuCollision) {
      skuCollisions += 1;
    }
    customBullets += verdict.content.customBullets;
    customUnparsedLines += verdict.content.customUnparsed;
    for (const flag of verdict.flags) {
      flags[flag] = (flags[flag] ?? 0) + 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    file,
    rows: verdicts.length,
    reference,
    columns: {
      total: header.length,
      mapped: columns.mapped.length,
      deferred: columns.deferred.length,
      ignored: columns.ignored.length,
      fallback: columns.fallback,
    },
    byAction,
    byType,
    published,
    drafts,
    priceless,
    wholesaleOnly,
    onSale,
    saleScheduled,
    featured,
    orphanVariations,
    shellDrafts,
    unbranded,
    brandsToCreate: [...brandsToCreate].sort(),
    categoriesToCreate: [...categoriesToCreate].sort(),
    imageless,
    images: { refs: imageRefs, distinct: [] },
    slugCollisions,
    skuCollisions,
    customBullets,
    customUnparsedLines,
    flags,
    decisions: DECISIONS,
    verdicts,
  };
}

/** Distinct image URLs need the raw cells; filled by the CLI post-pass. */
export function attachImageIndex(
  report: DryRunReport,
  urls: Iterable<string>,
): void {
  report.images.distinct = [...new Set(urls)].sort();
}

export function renderSummary(report: DryRunReport): string {
  const lines = [
    `WooCommerce dry-run: ${report.rows} rows from ${report.file}`,
    `reference state: ${report.reference.categories} categories, ${report.reference.brands} brands, ${report.reference.knownSourceKeys} known source keys`,
    `columns: ${report.columns.total} (mapped ${report.columns.mapped}, deferred ${report.columns.deferred}, ignored ${report.columns.ignored})`,
    report.columns.fallback.length > 0
      ? `FALLBACK COLUMNS NEED MAPPING: ${report.columns.fallback.join(' | ')}`
      : 'column map: complete, no fallback.',
    `actions: ${JSON.stringify(report.byAction)} types: ${JSON.stringify(report.byType)}`,
    `published ${report.published} / drafts ${report.drafts} (shell-drafts ${report.shellDrafts})`,
    `priceless ${report.priceless} (wholesale-only ${report.wholesaleOnly}) / on-sale ${report.onSale} / sale-windows ${report.saleScheduled} / featured ${report.featured}`,
    `orphan variations ${report.orphanVariations} / unbranded ${report.unbranded} / imageless ${report.imageless}`,
    `to-create: brands ${report.brandsToCreate.length} [${report.brandsToCreate.join(', ')}]; category segments ${report.categoriesToCreate.length} [${report.categoriesToCreate.join(', ')}]`,
    `images: ${report.images.refs} refs, ${report.images.distinct.length} distinct`,
    `collisions: slugs ${report.slugCollisions}, skus ${report.skuCollisions}; custom lines: ${report.customBullets} bullets, ${report.customUnparsedLines} unparsed`,
    `deferred flags: ${JSON.stringify(report.flags)}`,
    'decisions pending sign-off:',
    ...report.decisions.map((decision) => `  - ${decision}`),
  ];
  return lines.join('\n');
}
