import { Injectable } from '@nestjs/common';
import {
  InventoryMovementType,
  Prisma,
  PriceStatus,
  ProductCondition,
  ProductStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  DEFAULT_WAREHOUSE_CODE,
  ensureDefaultWarehouse,
} from '../../common/database/default-warehouse';
import { PrismaService } from '../../common/database/prisma.service';
import { generateSlug, ensureUniqueSlug, slugify } from '../products/slug';
import { normalizeTagName } from '../products/tags-normalize';
import {
  ATTRIBUTE_SOURCE_WOO_ATTR,
  ATTRIBUTE_SOURCE_WOO_CUSTOM,
} from '../products/attributes.service';
import {
  buildFileIndex,
  createClaimants,
  resolveRow,
  type ResolvedRow,
} from './woo-resolve';
import { parseWooCsvFile, type WooRecord } from './woo-parse';
import { WOO_SOURCE_SYSTEM, WooReferenceLoader } from './woo-reference';
import {
  buildProductPlan,
  buildRowHash,
  faError,
  type ProductPlan,
  type SpecPlan,
} from './woo-write';

/**
 * Product writer + ledger receipts + resume (SS-207).
 *
 * Turns SS-206 dry-run verdicts into real, re-runnable writes: per-product
 * transactions upserting Product/Variant by `(WOOCOMMERCE, شناسه)` with
 * category/brand/tag/attribute/media-reference attachment and one inventory
 * receipt per variant on the DEFAULT warehouse. Binaries are SS-208: media
 * rows are reference-only placeholders behind `--with-media-refs` (default
 * off). Every row is audit-trailed in ImportRun/ImportRecord with resume on
 * unchanged hashes and per-row isolation (one bad row never aborts the run).
 *
 * Policy rulings locked at implementation start: O-1 Rial verbatim, Q2
 * nullable brand, Q3 drafts-as-DRAFT, Q4 skip uncategorized, Q5 single
 * primary category.
 */

export interface RunImportOptions {
  file: string;
  limit?: number;
  /** Store media reference placeholders (default false: --skip-media). */
  includeMediaRefs?: boolean;
  /** Non-zero exit iff failures exceed this count (default 0). */
  failureThreshold?: number;
  /** Skip IMPORTED/UPDATED rows with unchanged hash (default true). */
  resume?: boolean;
  out?: string;
}

export interface RowFailure {
  line: number;
  sourceId: string;
  error: string;
}

export interface WriteReport {
  generatedAt: string;
  file: string;
  runId: string;
  rows: number;
  verdicts: { create: number; update: number; skip: number };
  products: { created: number; updated: number; skipped: number; failed: number };
  variants: { created: number; updated: number; failed: number };
  shellsPublished: number;
  brandsCreated: number;
  categoriesCreated: number;
  tagsCreated: number;
  attributesCreated: number;
  movements: number;
  mediaRefs: number;
  resumed: number;
  failures: RowFailure[];
  decisions: string[];
}

const WRITE_DECISIONS = [
  'O-1 decided: CSV prices are Rial, written verbatim (no conversion).',
  'Q1 decided: priceless published rows import as visible CALL_FOR_PRICE (non-purchasable).',
  'Q2 decided: unbranded rows import with nullable brand (no synthetic brand).',
  'Q3 decided: non-published rows import as DRAFT (admin-visible, storefront-hidden).',
  'Q4 decided: rows without any category and uncategorized-bucket rows are SKIPPED, never imported as a storefront category.',
  'Q5 decided: single primary category accepted for M2 (secondary join is P1).',
  'DEFERRED: brand alias reconciliation (O-2) and category merge review (O-3) precede the first full production write; the writer matches names exactly, first-seen wins.',
  'DEFERRED: media binaries belong to SS-208; SS-207 stores reference placeholders only with --with-media-refs.',
];

const PENDING_MEDIA_PREFIX = 'pending-woo';

type Tx = Prisma.TransactionClient;

interface RunState {
  productIdBySourceKey: Map<string, string>;
  variantIdBySourceKey: Map<string, string>;
  claimedSkus: Set<string>;
  brandsCreated: Set<string>;
  categoriesCreated: Set<string>;
  tagsCreated: Set<string>;
  attributesCreated: Set<string>;
  counts: {
    productsCreated: number;
    productsUpdated: number;
    variantsCreated: number;
    variantsUpdated: number;
    shellsPublished: number;
    movements: number;
    mediaRefs: number;
    resumed: number;
  };
  failures: RowFailure[];
  shells: Array<{ sourceId: string; productId: string; published: boolean }>;
}

function shortHash(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 12);
}

@Injectable()
export class WooRunner {
  constructor(private readonly prisma: PrismaService) {}

  async runImport(options: RunImportOptions): Promise<{ report: WriteReport; exitCode: number }> {
    const threshold = options.failureThreshold ?? 0;
    const resume = options.resume ?? true;
    const includeMediaRefs = options.includeMediaRefs ?? false;

    const parsed = parseWooCsvFile(options.file, options.limit);
    const loader = new WooReferenceLoader(this.prisma);
    const refs = await loader.load();
    const index = buildFileIndex(parsed.rows);
    const claimants = createClaimants(refs);

    const verdicts: Array<{ record: WooRecord; verdict: ResolvedRow }> = [];
    for (const record of parsed.rows) {
      verdicts.push({ record, verdict: await resolveRow(record, refs, index, claimants) });
    }

    const run = await this.prisma.importRun.create({
      data: { sourceSystem: WOO_SOURCE_SYSTEM },
      select: { id: true },
    });

    await ensureDefaultWarehouse(this.prisma);
    const warehouse = await this.prisma.warehouse.findUniqueOrThrow({
      where: { code: DEFAULT_WAREHOUSE_CODE },
      select: { id: true },
    });

    // Preload source identity → catalog ids for cross-run variation linkage
    // and resume comparison (latest record per source row).
    const state = await this.buildRunState();

    let creates = 0;
    let updates = 0;
    let skips = 0;

    const processOne = async (record: WooRecord, verdict: ResolvedRow): Promise<void> => {
      const sourceKey = `${WOO_SOURCE_SYSTEM}:${verdict.sourceId}`;
      if (verdict.action === 'SKIP') {
        skips += 1;
        await this.recordRow(run.id, record, verdict, 'SKIPPED', verdict.reasons.join(' | ') || 'SKIP', null, null);
        return;
      }
      if (verdict.action === 'UPDATE') {
        updates += 1;
      } else {
        creates += 1;
      }

      const rowHash = buildRowHash(record.cells);
      if (resume) {
        const prior = await this.prisma.importRecord.findFirst({
          where: { sourceSystem: WOO_SOURCE_SYSTEM, sourceId: verdict.sourceId },
          orderBy: { createdAt: 'desc' },
          select: { status: true, sourceRowHash: true },
        });
        if (
          prior &&
          (prior.status === 'IMPORTED' || prior.status === 'UPDATED') &&
          prior.sourceRowHash === rowHash
        ) {
          state.counts.resumed += 1;
          await this.recordRow(run.id, record, verdict, 'SKIPPED', 'resume: unchanged hash, skipped.', null, null, rowHash);
          return;
        }
      }

      const plan = buildProductPlan(record, verdict);
      if (!plan) {
        skips += 1;
        await this.recordRow(run.id, record, verdict, 'SKIPPED', verdict.reasons.join(' | ') || 'SKIP', null, null, rowHash);
        return;
      }

      try {
        if (plan.sourceType === 'variation') {
          await this.writeVariation(plan, state, warehouse.id, includeMediaRefs);
        } else {
          await this.writeProduct(plan, state, warehouse.id, includeMediaRefs);
        }
        const isUpdate = verdict.action === 'UPDATE';
        await this.recordRow(
          run.id,
          record,
          verdict,
          isUpdate ? 'UPDATED' : 'IMPORTED',
          null,
          state.productIdBySourceKey.get(sourceKey) ?? null,
          state.variantIdBySourceKey.get(sourceKey) ?? null,
          rowHash,
        );
      } catch (error) {
        state.failures.push({ line: verdict.line, sourceId: verdict.sourceId, error: faError(error) });
        await this.recordRow(run.id, record, verdict, 'FAILED', faError(error), null, null, rowHash);
      }
    };

    try {
      // Pass 1: products (simple + variable shells) before variations.
      for (const { record, verdict } of verdicts) {
        if (verdict.sourceType !== 'variation') {
          await processOne(record, verdict);
        }
      }
      // Pass 2: variations link against pass-1 (or cross-run) parents.
      for (const { record, verdict } of verdicts) {
        if (verdict.sourceType === 'variation') {
          await processOne(record, verdict);
        }
      }
      await this.promoteShells(state);
    } catch (error) {
      await this.prisma.importRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', finishedAt: new Date(), error: faError(error) },
      });
      throw error;
    }

    const failed = state.failures.length;
    await this.prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: failed > threshold ? 'FAILED' : 'COMPLETED',
        finishedAt: new Date(),
        error: failed > 0 ? `${failed} row(s) failed.` : null,
      },
    });

    const report: WriteReport = {
      generatedAt: new Date().toISOString(),
      file: options.file,
      runId: run.id,
      rows: verdicts.length,
      verdicts: { create: creates, update: updates, skip: skips },
      products: {
        created: state.counts.productsCreated,
        updated: state.counts.productsUpdated,
        skipped: skips,
        failed: failed,
      },
      variants: { created: state.counts.variantsCreated, updated: state.counts.variantsUpdated, failed },
      shellsPublished: state.counts.shellsPublished,
      brandsCreated: state.brandsCreated.size,
      categoriesCreated: state.categoriesCreated.size,
      tagsCreated: state.tagsCreated.size,
      attributesCreated: state.attributesCreated.size,
      movements: state.counts.movements,
      mediaRefs: state.counts.mediaRefs,
      resumed: state.counts.resumed,
      failures: state.failures,
      decisions: WRITE_DECISIONS,
    };
    return { report, exitCode: failed > threshold ? 1 : 0 };
  }

  // ------------------------------------------------------------------ setup

  private async buildRunState(): Promise<RunState> {
    const [sourcedProducts, sourcedVariants] = await Promise.all([
      this.prisma.product.findMany({
        where: { sourceSystem: WOO_SOURCE_SYSTEM, sourceId: { not: null } },
        select: { id: true, sourceId: true },
      }),
      this.prisma.productVariant.findMany({
        where: { sourceSystem: WOO_SOURCE_SYSTEM, sourceId: { not: null } },
        select: { id: true, productId: true, sourceId: true },
      }),
    ]);
    const productIdBySourceKey = new Map<string, string>();
    const variantIdBySourceKey = new Map<string, string>();
    for (const row of sourcedProducts) {
      if (row.sourceId) {
        productIdBySourceKey.set(`${WOO_SOURCE_SYSTEM}:${row.sourceId}`, row.id);
      }
    }
    for (const row of sourcedVariants) {
      if (row.sourceId) {
        variantIdBySourceKey.set(`${WOO_SOURCE_SYSTEM}:${row.sourceId}`, row.id);
        if (!productIdBySourceKey.has(`${WOO_SOURCE_SYSTEM}:${row.sourceId}`)) {
          productIdBySourceKey.set(`${WOO_SOURCE_SYSTEM}:${row.sourceId}`, row.productId);
        }
      }
    }
    return {
      productIdBySourceKey,
      variantIdBySourceKey,
      claimedSkus: new Set<string>(),
      brandsCreated: new Set<string>(),
      categoriesCreated: new Set<string>(),
      tagsCreated: new Set<string>(),
      attributesCreated: new Set<string>(),
      counts: {
        productsCreated: 0,
        productsUpdated: 0,
        variantsCreated: 0,
        variantsUpdated: 0,
        shellsPublished: 0,
        movements: 0,
        mediaRefs: 0,
        resumed: 0,
      },
      failures: [],
      shells: [],
    };
  }

  private async recordRow(
    runId: string,
    record: WooRecord,
    verdict: ResolvedRow,
    status: 'IMPORTED' | 'UPDATED' | 'SKIPPED' | 'FAILED',
    error: string | null,
    productId: string | null,
    variantId: string | null,
    rowHash?: string,
  ): Promise<void> {
    await this.prisma.importRecord.create({
      data: {
        runId,
        sourceSystem: WOO_SOURCE_SYSTEM,
        sourceId: verdict.sourceId,
        sourceType: verdict.sourceType || null,
        sourceRowHash: rowHash ?? buildRowHash(record.cells),
        status,
        attempts: 1,
        error,
        sourceData: record.cells as Prisma.InputJsonValue,
        productId,
        variantId,
      },
    });
  }

  // ------------------------------------------------------------------ writes

  /** Simple products (own variant) and variable shells (no variant). */
  private async writeProduct(
    plan: ProductPlan,
    state: RunState,
    warehouseId: string,
    includeMediaRefs: boolean,
  ): Promise<void> {
    const sourceKey = `${WOO_SOURCE_SYSTEM}:${plan.sourceId}`;
    await this.prisma.$transaction(async (tx) => {
      const categoryId = await this.ensureCategoryPath(tx, plan, state);
      const brandId = await this.ensureBrand(tx, plan.brandName, state);

      const existing = await tx.product.findUnique({
        where: { sourceSystem_sourceId: { sourceSystem: WOO_SOURCE_SYSTEM, sourceId: plan.sourceId } },
        select: { id: true, slug: true },
      });

      const gatedStatus =
        plan.sourceType === 'variable' ? ProductStatus.DRAFT : plan.status === 'PUBLISHED' ? ProductStatus.PUBLISHED : ProductStatus.DRAFT;

      const data = {
        name: plan.name,
        shortDescription: plan.shortDescription,
        description: plan.description,
        brandId,
        categoryId,
        warranty: plan.warranty,
        condition: ProductCondition.NEW,
        status: gatedStatus,
        weightKg: plan.weightKg,
        widthCm: plan.widthCm,
        heightCm: plan.heightCm,
        depthCm: plan.depthCm,
        originCountry: null as string | null,
        nameEn: plan.nameEn,
        subtitle: plan.subtitle,
        metaTitle: plan.metaTitle,
        metaDescription: plan.metaDescription,
        focusKeyword: plan.focusKeyword,
        sourceSystem: WOO_SOURCE_SYSTEM,
        sourceId: plan.sourceId,
        sourceType: plan.sourceType,
        updatedBy: plan.actor,
      };

      let productId: string;
      if (existing) {
        await tx.product.update({ where: { id: existing.id }, data });
        productId = existing.id;
        state.counts.productsUpdated += 1;
      } else {
        const slug = await this.uniqueProductSlug(tx, plan.name);
        const created = await tx.product.create({
          data: { ...data, slug, status: ProductStatus.DRAFT, createdBy: plan.actor },
          select: { id: true },
        });
        // New rows start DRAFT so variants attach first; publish below.
        productId = created.id;
        state.counts.productsCreated += 1;
      }
      state.productIdBySourceKey.set(sourceKey, productId);

      // Simple rows own exactly one variant; variable shells carry none.
      if (plan.sourceType === 'simple') {
        const variantId = await this.upsertVariant(tx, state, productId, plan, null);
        await this.applyVariantAxes(tx, state, variantId, plan.variantAxes);
        await this.applyInventory(tx, state, variantId, plan.stockQty, plan.sourceId, warehouseId, plan.actor);
      }

      const specs = [...plan.specs, ...plan.customSpecs];
      await this.applySpecs(tx, state, productId, specs);
      await this.applyTags(tx, state, productId, plan.tags);
      if (includeMediaRefs) {
        await this.applyMediaRefs(tx, state, productId, null, plan);
      }

      if (plan.sourceType === 'variable') {
        state.shells.push({ sourceId: plan.sourceId, productId, published: plan.status === 'PUBLISHED' });
      } else if (gatedStatus === ProductStatus.PUBLISHED) {
        // Simple products are complete once their lone variant exists.
        await tx.product.update({ where: { id: productId }, data: { status: ProductStatus.PUBLISHED } });
      }
    });
  }

  /** Variation rows: variant under the parent shell + parent-level content. */
  private async writeVariation(
    plan: ProductPlan,
    state: RunState,
    warehouseId: string,
    includeMediaRefs: boolean,
  ): Promise<void> {
    const sourceKey = `${WOO_SOURCE_SYSTEM}:${plan.sourceId}`;
    const parentSourceKey = plan.parentSourceKey;
    if (!parentSourceKey) {
      throw new Error('مادر محصول والد مشخص نیست.');
    }
    const parentProductId = state.productIdBySourceKey.get(parentSourceKey);
    if (!parentProductId) {
      throw new Error('محصول والد در کاتالوگ یافت نشد.');
    }
    await this.prisma.$transaction(async (tx) => {
      const variantId = await this.upsertVariant(tx, state, parentProductId, plan, plan.name);
      await this.applyVariantAxes(tx, state, variantId, plan.variantAxes);
      await this.applyInventory(tx, state, variantId, plan.stockQty, plan.sourceId, warehouseId, plan.actor);
      const parentSpecs = [...plan.parentSpecs, ...plan.customParentSpecs];
      await this.applySpecs(tx, state, parentProductId, parentSpecs);
      state.productIdBySourceKey.set(sourceKey, parentProductId);
      state.variantIdBySourceKey.set(sourceKey, variantId);
      if (includeMediaRefs) {
        await this.applyMediaRefs(tx, state, parentProductId, variantId, plan);
      }
    });
  }

  /** Publish gated shells that now hold at least one live variation. */
  private async promoteShells(state: RunState): Promise<void> {
    for (const shell of state.shells) {
      if (!shell.published) {
        continue;
      }
      const count = await this.prisma.productVariant.count({
        where: { productId: shell.productId, deletedAt: null },
      });
      if (count === 0) {
        continue;
      }
      const updated = await this.prisma.product.updateMany({
        where: { id: shell.productId, status: ProductStatus.DRAFT, deletedAt: null },
        data: { status: ProductStatus.PUBLISHED, updatedBy: 'woo-import' },
      });
      if (updated.count > 0) {
        state.counts.shellsPublished += 1;
      }
    }
  }

  // ------------------------------------------------------------------ helpers

  private async ensureCategoryPath(
    tx: Tx,
    plan: ProductPlan,
    state: RunState,
  ): Promise<string> {
    const chain = plan.categoryChains[0];
    if (!chain || chain.length === 0) {
      throw new Error('دسته‌بندی محصول مشخص نیست.');
    }
    let parentId: string | null = null;
    const path: string[] = [];
    for (const segment of chain) {
      path.push(segment);
      const existing: { id: string } | null = await tx.category.findFirst({
        where: { parentId, name: segment, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        parentId = existing.id;
        continue;
      }
      const slug = await this.uniqueSlug(tx, 'category', segment);
      const siblings = await tx.category.count({ where: { parentId, deletedAt: null } });
      const created: { id: string } = await tx.category.create({
        data: { name: segment, slug, parentId, sortOrder: siblings, isVisible: true, createdBy: plan.actor },
        select: { id: true },
      });
      parentId = created.id;
      state.categoriesCreated.add(path.join(' > '));
    }
    return parentId as string;
  }

  private async ensureBrand(tx: Tx, name: string | null, state: RunState): Promise<string | null> {
    if (name === null) {
      return null;
    }
    const existing = await tx.brand.findFirst({
      where: { name, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }
    const slug = await this.uniqueSlug(tx, 'brand', name);
    const created = await tx.brand.create({
      data: { name, slug, createdBy: 'woo-import' },
      select: { id: true },
    });
    state.brandsCreated.add(name);
    return created.id;
  }

  private async uniqueProductSlug(tx: Tx, name: string): Promise<string> {
    const result = await ensureUniqueSlug(name, 'product', async (slug) => {
      const hit = await tx.product.findUnique({ where: { slug }, select: { id: true } });
      return hit !== null;
    });
    return result.slug;
  }

  private async uniqueSlug(tx: Tx, table: 'category' | 'brand' | 'tag', name: string): Promise<string> {
    const base = slugify(name) || generateSlug(name, table);
    const exists = async (slug: string): Promise<boolean> => {
      if (table === 'category') {
        return (await tx.category.findUnique({ where: { slug }, select: { id: true } })) !== null;
      }
      if (table === 'brand') {
        return (await tx.brand.findUnique({ where: { slug }, select: { id: true } })) !== null;
      }
      return (await tx.tag.findUnique({ where: { slug }, select: { id: true } })) !== null;
    };
    if (!(await exists(base))) {
      return base;
    }
    for (let attempt = 2; attempt <= 100; attempt += 1) {
      const candidate = `${base}-${attempt}`;
      if (!(await exists(candidate))) {
        return candidate;
      }
    }
    return `${base}-${shortHash(name)}`;
  }

  private async dedupeSku(tx: Tx, state: RunState, desired: string | null, sourceId: string): Promise<string> {
    const base = desired && desired.length > 0 ? desired.slice(0, 64) : `WOO-${sourceId}`.slice(0, 64);
    const taken = async (sku: string): Promise<boolean> => {
      if (state.claimedSkus.has(sku)) {
        return true;
      }
      return (await tx.productVariant.findUnique({ where: { sku }, select: { id: true } })) !== null;
    };
    if (!(await taken(base))) {
      state.claimedSkus.add(base);
      return base;
    }
    for (let attempt = 2; attempt <= 100; attempt += 1) {
      const candidate = `${base.slice(0, 60)}-${attempt}`;
      if (!(await taken(candidate))) {
        state.claimedSkus.add(candidate);
        return candidate;
      }
    }
    const fallback = `WOO-${sourceId}-${shortHash(base)}`.slice(0, 64);
    state.claimedSkus.add(fallback);
    return fallback;
  }

  private async upsertVariant(
    tx: Tx,
    state: RunState,
    productId: string,
    plan: ProductPlan,
    variantName: string | null,
  ): Promise<string> {
    const sourceKey = `${WOO_SOURCE_SYSTEM}:${plan.sourceId}`;
    const existing = await tx.productVariant.findUnique({
      where: { sourceSystem_sourceId: { sourceSystem: WOO_SOURCE_SYSTEM, sourceId: plan.sourceId } },
      select: { id: true },
    });
    const priceStatus = plan.priceStatus === 'PRICED' ? PriceStatus.PRICED : PriceStatus.CALL_FOR_PRICE;
    if (existing) {
      await tx.productVariant.update({
        where: { id: existing.id },
        data: {
          barcode: plan.barcode,
          name: variantName,
          price: plan.price,
          compareAtPrice: plan.compareAtPrice,
          priceStatus,
          updatedBy: plan.actor,
        },
      });
      state.counts.variantsUpdated += 1;
      state.variantIdBySourceKey.set(sourceKey, existing.id);
      return existing.id;
    }
    const sku = await this.dedupeSku(tx, state, plan.sku, plan.sourceId);
    const created = await tx.productVariant.create({
      data: {
        productId,
        sku,
        barcode: plan.barcode,
        name: variantName,
        price: plan.price,
        compareAtPrice: plan.compareAtPrice,
        priceStatus,
        sourceSystem: WOO_SOURCE_SYSTEM,
        sourceId: plan.sourceId,
        sourceType: plan.sourceType,
        createdBy: plan.actor,
      },
      select: { id: true },
    });
    state.counts.variantsCreated += 1;
    state.variantIdBySourceKey.set(sourceKey, created.id);
    return created.id;
  }

  private async applySpecs(tx: Tx, state: RunState, productId: string, specs: SpecPlan[]): Promise<void> {
    let order = await tx.productAttributeValue.count({ where: { productId } });
    for (const spec of specs) {
      if (!spec.name || !spec.value) {
        continue;
      }
      const attribute = await this.ensureAttribute(tx, state, spec.name.slice(0, 120), spec.group?.slice(0, 120) ?? null, 'SPEC', false);
      const valueRow = await this.ensureAttributeValue(tx, attribute.id, spec.value.slice(0, 255));
      // Check-then-create: swallowing a unique violation inside an
      // interactive transaction would abort the whole transaction (25P02 on
      // every later statement), so idempotent assignments pre-check instead.
      const assigned = await tx.productAttributeValue.findFirst({
        where: { productId, attributeValueId: valueRow.id },
        select: { id: true },
      });
      if (assigned) {
        continue;
      }
      await tx.productAttributeValue.create({
        data: {
          productId,
          attributeValueId: valueRow.id,
          sortOrder: order,
          source: spec.source === 'WOO_CUSTOM' ? ATTRIBUTE_SOURCE_WOO_CUSTOM : ATTRIBUTE_SOURCE_WOO_ATTR,
        },
      });
      order += 1;
    }
  }

  private async applyVariantAxes(
    tx: Tx,
    state: RunState,
    variantId: string,
    axes: Array<{ name: string; value: string }>,
  ): Promise<void> {
    for (const axis of axes) {
      if (!axis.name || !axis.value) {
        continue;
      }
      const attribute = await this.ensureAttribute(tx, state, axis.name.slice(0, 120), null, 'VARIANT_OPTION', true);
      const valueRow = await this.ensureAttributeValue(tx, attribute.id, axis.value.slice(0, 255));
      const siblings = await tx.variantAttributeValue.findMany({
        where: { variantId },
        select: { id: true, attributeValueId: true, attributeValue: { select: { attributeId: true } } },
      });
      for (const sibling of siblings) {
        if (sibling.attributeValue.attributeId === attribute.id && sibling.attributeValueId !== valueRow.id) {
          await tx.variantAttributeValue.delete({ where: { id: sibling.id } });
        }
      }
      const linked = await tx.variantAttributeValue.findFirst({
        where: { variantId, attributeValueId: valueRow.id },
        select: { id: true },
      });
      if (!linked) {
        await tx.variantAttributeValue.create({
          data: { variantId, attributeValueId: valueRow.id },
        });
      }
    }
  }

  private async ensureAttribute(
    tx: Tx,
    state: RunState,
    name: string,
    group: string | null,
    type: 'SPEC' | 'VARIANT_OPTION',
    isGlobal: boolean,
  ): Promise<{ id: string }> {
    const existing = await tx.attribute.findUnique({ where: { name }, select: { id: true, type: true } });
    if (existing) {
      return { id: existing.id };
    }
    const slug = await this.uniqueAttributeSlug(tx, name);
    const created = await tx.attribute.create({
      data: { name, slug, type, group, isGlobal },
      select: { id: true },
    });
    state.attributesCreated.add(name);
    return { id: created.id };
  }

  private async uniqueAttributeSlug(tx: Tx, name: string): Promise<string> {
    const base = slugify(name) || generateSlug(name, 'attribute');
    if ((await tx.attribute.findUnique({ where: { slug: base }, select: { id: true } })) === null) {
      return base;
    }
    for (let attempt = 2; attempt <= 100; attempt += 1) {
      const candidate = `${base}-${attempt}`;
      if ((await tx.attribute.findUnique({ where: { slug: candidate }, select: { id: true } })) === null) {
        return candidate;
      }
    }
    return `${base}-${shortHash(name)}`;
  }

  private async ensureAttributeValue(tx: Tx, attributeId: string, value: string): Promise<{ id: string }> {
    const existing = await tx.attributeValue.findUnique({
      where: { attributeId_value: { attributeId, value } },
      select: { id: true },
    });
    if (existing) {
      return { id: existing.id };
    }
    const created = await tx.attributeValue.create({
      data: { attributeId, value, slug: slugify(value).slice(0, 120) || `value-${shortHash(value)}` },
      select: { id: true },
    });
    return { id: created.id };
  }

  private async applyTags(tx: Tx, state: RunState, productId: string, tags: string[]): Promise<void> {
    let order = await tx.productTag.count({ where: { productId } });
    for (const raw of tags) {
      const normalized = normalizeTagName(raw);
      if (!normalized) {
        continue;
      }
      const existing = await tx.tag.findUnique({ where: { key: normalized.key }, select: { id: true } });
      let tagId: string;
      if (existing) {
        tagId = existing.id;
      } else {
        const slug = await this.uniqueSlug(tx, 'tag', normalized.name);
        const created = await tx.tag.create({
          data: { name: normalized.name, key: normalized.key, slug },
          select: { id: true },
        });
        tagId = created.id;
        state.tagsCreated.add(normalized.name);
      }
      const assigned = await tx.productTag.findFirst({
        where: { productId, tagId },
        select: { id: true },
      });
      if (assigned) {
        continue;
      }
      await tx.productTag.create({ data: { productId, tagId, sortOrder: order } });
      order += 1;
    }
  }

  private async applyMediaRefs(
    tx: Tx,
    state: RunState,
    productId: string,
    variantId: string | null,
    plan: ProductPlan,
  ): Promise<void> {
    const existingMax = await tx.productMedia.aggregate({
      where: { productId },
      _max: { sortOrder: true },
    });
    let order = (existingMax._max.sortOrder ?? -1) + 1;
    for (const [position, item] of plan.media.entries()) {
      const hit = await tx.productMedia.findUnique({
        where: { productId_sourceUrl: { productId, sourceUrl: item.url } },
        select: { id: true },
      });
      if (hit) {
        continue;
      }
      const urlPath = item.url.split('?')[0] ?? item.url;
      const basename = urlPath.split('/').filter(Boolean).pop() ?? `image-${position}.jpg`;
      await tx.productMedia.create({
        data: {
          productId,
          variantId,
          mediaType: 'IMAGE',
          originalName: basename.slice(0, 255),
          mimeType: 'image/jpeg',
          sizeBytes: 0,
          // Placeholder identity until SS-208 downloads binaries and fills
          // storageKey/contentHash via the real media pipeline.
          storageKey: `${PENDING_MEDIA_PREFIX}:${plan.sourceId}:${shortHash(item.url)}`,
          sourceUrl: item.url,
          sortOrder: order,
          isPrimary: variantId === null && item.isPrimary,
          createdBy: plan.actor,
        },
      });
      order += 1;
      state.counts.mediaRefs += 1;
    }
  }

  private async applyInventory(
    tx: Tx,
    state: RunState,
    variantId: string,
    quantity: number,
    sourceId: string,
    warehouseId: string,
    actor: string,
  ): Promise<void> {
    const item = await tx.inventoryItem.findUnique({
      where: { variantId_warehouseId: { variantId, warehouseId } },
      select: { id: true, quantityOnHand: true },
    });
    if (!item) {
      const created = await tx.inventoryItem.create({
        data: { variantId, warehouseId, quantityOnHand: quantity, quantityReserved: 0, createdBy: actor },
        select: { id: true },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: created.id,
          variantId,
          warehouseId,
          type: InventoryMovementType.INITIAL_STOCK,
          quantity,
          reservedDelta: 0,
          reason: 'موجودی اولیه واردات',
          reference: `woo:${sourceId}`,
          onHandBefore: 0,
          onHandAfter: quantity,
          reservedBefore: 0,
          reservedAfter: 0,
          createdBy: actor,
        },
      });
      state.counts.movements += 1;
      return;
    }
    if (item.quantityOnHand === quantity) {
      return;
    }
    const delta = quantity - item.quantityOnHand;
    if (delta > 0) {
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantityOnHand: { increment: delta }, updatedBy: actor },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: item.id,
          variantId,
          warehouseId,
          type: InventoryMovementType.PURCHASE_RECEIPT,
          quantity: delta,
          reservedDelta: 0,
          reason: 'رسید خرید واردات',
          reference: `woo:${sourceId}`,
          onHandBefore: item.quantityOnHand,
          onHandAfter: quantity,
          reservedBefore: 0,
          reservedAfter: 0,
          createdBy: actor,
        },
      });
    } else {
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantityOnHand: quantity, updatedBy: actor },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: item.id,
          variantId,
          warehouseId,
          type: InventoryMovementType.MANUAL_ADJUSTMENT,
          quantity: delta,
          reservedDelta: 0,
          reason: 'اصلاح موجودی واردات',
          reference: `woo:${sourceId}`,
          onHandBefore: item.quantityOnHand,
          onHandAfter: quantity,
          reservedBefore: 0,
          reservedAfter: 0,
          createdBy: actor,
        },
      });
    }
    state.counts.movements += 1;
  }
}

export function renderWriteSummary(report: WriteReport): string {
  const lines = [
    `WooCommerce import write: ${report.rows} rows from ${report.file}`,
    `run ${report.runId}`,
    `verdicts: create ${report.verdicts.create} / update ${report.verdicts.update} / skip ${report.verdicts.skip}`,
    `products: created ${report.products.created} / updated ${report.products.updated} / skipped ${report.products.skipped} / failed ${report.products.failed}`,
    `variants: created ${report.variants.created} / updated ${report.variants.updated} / failed ${report.variants.failed}`,
    `shells published ${report.shellsPublished} / resumed ${report.resumed}`,
    `created refs: brands ${report.brandsCreated}, category segments ${report.categoriesCreated}, tags ${report.tagsCreated}, attributes ${report.attributesCreated}`,
    `ledger movements ${report.movements} / media refs ${report.mediaRefs}`,
    ...report.failures.map((failure) => `FAILED line ${failure.line} (${failure.sourceId}): ${failure.error}`),
    'policy rulings:',
    ...report.decisions.map((decision) => `  - ${decision}`),
  ];
  return lines.join('\n');
}
