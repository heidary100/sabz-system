#!/usr/bin/env tsx
/**
 * Read-only WooCommerce import reconciliation (stabilization).
 *
 * Compares the CSV source against the catalog by persisted source identity
 * (never by title) and verifies prices, sale windows, parent/variation
 * relations, SKU uniqueness, categories/brands/attributes, media links and
 * public image retrieval. Writes nothing.
 *
 * Usage:
 *   pnpm --filter @sabz/api woo:reconcile -- --file <export.csv>
 *     [--out <report.json>] [--api-base http://localhost:3000/api/v1]
 *     [--skip-media-http] [--allow-missing-media] [--concurrency 8]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../../../common/database/prisma.service';
import { normalizeBrandName } from '../../products/brand-normalize';
import { parseWooCsvFile, cell, splitCell } from '../woo-parse';
import {
  buildFileIndex,
  createClaimants,
  resolveRow,
  type ResolvedRow,
} from '../woo-resolve';
import { buildProductPlan } from '../woo-write';
import { WOO_SOURCE_SYSTEM, WooReferenceLoader } from '../woo-reference';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

interface ReconcileReport {
  generatedAt: string;
  file: string;
  rows: number;
  productsInCsv: number;
  variationsInCsv: number;
  missingProducts: string[];
  missingVariants: string[];
  orphansInDb: Array<{ sourceId: string; name: string; status: string }>;
  duplicateSkus: Array<{ sku: string; count: number }>;
  parentMismatches: Array<{ sourceId: string; expectedParent: string; actualParent: string }>;
  categoryMissing: Array<{ sourceId: string; category: string }>;
  brandMissing: Array<{ sourceId: string; brand: string }>;
  priceMismatches: Array<{
    sourceId: string;
    field: string;
    expected: string | null;
    actual: string | null;
  }>;
  attributeMismatches: Array<{
    sourceId: string;
    field: 'spec' | 'variantAxis';
    name: string;
    value: string;
    state: 'missing' | 'extra';
  }>;
  media: {
    productsChecked: number;
    /** CSV URLs with no active media row (failed/deduped imports). */
    missing: Array<{ sourceId: string; url: string }>;
    /** Active imported URLs that are no longer in the CSV gallery. */
    extra: Array<{ sourceId: string; url: string }>;
    /** Same gallery set but wrong display order. */
    orderMismatches: Array<{ sourceId: string; expected: string[]; actual: string[] }>;
    primaryMissing: string[];
    multiplePrimary: string[];
    publicChecked: number;
    publicFailed: Array<{ mediaId: string; status: number | null; error: string | null }>;
    httpSkipped: boolean;
    allowMissing: boolean;
  };
  saleWindows: { scheduled: number; active: number; expired: number };
  ok: boolean;
}

async function httpOk(
  base: string,
  mediaId: string,
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  try {
    const response = await fetch(
      `${base.replace(/\/+$/, '')}/catalog/media/${mediaId}`,
      { method: 'GET', headers: { Accept: 'image/*' } },
    );
    // Cancel the body: only retrieval/status is being verified.
    await response.body?.cancel().catch(() => undefined);
    return { ok: response.ok, status: response.status, error: null };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const file = arg('file');
  if (!file) {
    throw new Error('Missing required --file <woocommerce-export.csv>.');
  }
  const input = resolve(process.cwd(), file);
  const outArg = arg('out');
  const out =
    outArg === undefined ? `${input}.reconcile.json` : resolve(process.cwd(), outArg);
  const apiBase = arg('api-base') ?? 'http://localhost:3000/api/v1';
  const skipMediaHttp = flag('skip-media-http');
  const allowMissingMedia = flag('allow-missing-media');
  const concurrency = Math.max(1, Number(arg('concurrency') ?? 8));

  const parsed = parseWooCsvFile(input);
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const rows = parsed.rows;
    const sourceIds = rows.map((row) => cell(row, 'شناسه')).filter(Boolean);
    const sourceIdSet = new Set(sourceIds);

    // Authoritative dry-run verdicts: policy SKIPs are expected absences, not
    // reconciliation failures.
    const refs = await new WooReferenceLoader(prisma).load();
    const index = buildFileIndex(rows);
    const claimants = createClaimants(refs);
    const skippedSourceIds = new Set<string>();
    const verdictBySource = new Map<string, ResolvedRow>();
    for (const row of rows) {
      const verdict = await resolveRow(row, refs, index, claimants);
      verdictBySource.set(verdict.sourceId, verdict);
      if (verdict.action === 'SKIP') {
        skippedSourceIds.add(verdict.sourceId);
      }
    }

    const [products, variants] = await Promise.all([
      prisma.product.findMany({
        where: { sourceSystem: WOO_SOURCE_SYSTEM, deletedAt: null },
        select: {
          id: true,
          sourceId: true,
          name: true,
          status: true,
          categoryId: true,
          brandId: true,
          category: { select: { name: true } },
          brand: { select: { name: true } },
        },
      }),
      prisma.productVariant.findMany({
        where: { sourceSystem: WOO_SOURCE_SYSTEM, deletedAt: null },
        select: {
          id: true,
          sourceId: true,
          sku: true,
          productId: true,
          price: true,
          discountedPrice: true,
          discountStartsAt: true,
          discountEndsAt: true,
          priceStatus: true,
          product: { select: { sourceId: true } },
        },
      }),
    ]);

    const productBySource = new Map(
      products.filter((p) => p.sourceId).map((p) => [p.sourceId as string, p]),
    );
    const variantBySource = new Map(
      variants.filter((v) => v.sourceId).map((v) => [v.sourceId as string, v]),
    );

    const report: ReconcileReport = {
      generatedAt: new Date().toISOString(),
      file: input,
      rows: rows.length,
      productsInCsv: rows.filter((r) => cell(r, 'نوع') !== 'variation').length,
      variationsInCsv: rows.filter((r) => cell(r, 'نوع') === 'variation').length,
      missingProducts: [],
      missingVariants: [],
      orphansInDb: [],
      duplicateSkus: [],
      parentMismatches: [],
      categoryMissing: [],
      brandMissing: [],
      priceMismatches: [],
      attributeMismatches: [],
      media: {
        productsChecked: 0,
        missing: [],
        extra: [],
        orderMismatches: [],
        primaryMissing: [],
        multiplePrimary: [],
        publicChecked: 0,
        publicFailed: [],
        httpSkipped: skipMediaHttp,
        allowMissing: allowMissingMedia,
      },
      saleWindows: { scheduled: 0, active: 0, expired: 0 },
      ok: true,
    };

    const now = Date.now();
    const expectedSkuCounts = new Map<string, number>();
    const expectedMedia = new Map<string, { sourceId: string; urls: string[] }>();
    const expectedSpecs = new Map<
      string,
      { sourceId: string; values: Set<string> }
    >();
    const expectedAxes = new Map<
      string,
      { sourceId: string; values: Set<string> }
    >();

    for (const row of rows) {
      const sourceId = cell(row, 'شناسه');
      const sourceType = cell(row, 'نوع');
      if (!sourceId) {
        continue;
      }
      const product = productBySource.get(sourceId);
      const variant = variantBySource.get(sourceId);
      const expectedSkip = skippedSourceIds.has(sourceId);
      if (sourceType === 'variable') {
        if (!product) {
          if (!expectedSkip) report.missingProducts.push(sourceId);
          continue;
        }
      } else if (!variant) {
        if (!expectedSkip) report.missingVariants.push(sourceId);
        continue;
      }
      const expectedSku = cell(row, 'شناسه محصول');
      if (variant && expectedSku) {
        expectedSkuCounts.set(expectedSku, (expectedSkuCounts.get(expectedSku) ?? 0) + 1);
        // The admin SKU contract is 64 chars; the importer truncates longer
        // Woo product codes deterministically. Compare against that mapping.
        const mappedSku = expectedSku.slice(0, 64);
        if (variant.sku !== mappedSku) {
          report.priceMismatches.push({
            sourceId,
            field: 'sku',
            expected: mappedSku,
            actual: variant.sku,
          });
        }
      }
      const verdict = verdictBySource.get(sourceId);
      const plan = verdict === undefined ? null : buildProductPlan(row, verdict);
      if (!plan) {
        continue;
      }
      const pushPriceMismatch = (
        field: string,
        expected: string | null,
        actual: string | null,
      ): void => {
        if (expected !== actual) {
          report.priceMismatches.push({ sourceId, field, expected, actual });
        }
      };
      if (variant) {
        pushPriceMismatch('price', plan.price, variant.price.toString());
        pushPriceMismatch('priceStatus', plan.priceStatus, variant.priceStatus);
        pushPriceMismatch(
          'discountedPrice',
          plan.discountedPrice,
          variant.discountedPrice?.toString() ?? null,
        );
        pushPriceMismatch(
          'discountStartsAt',
          plan.discountStartsAt,
          variant.discountStartsAt?.toISOString() ?? null,
        );
        pushPriceMismatch(
          'discountEndsAt',
          plan.discountEndsAt,
          variant.discountEndsAt?.toISOString() ?? null,
        );
      }
      if (plan.discountEndsAt !== null) {
        const end = new Date(plan.discountEndsAt);
        report.saleWindows.scheduled += 1;
        if (end.getTime() >= now) report.saleWindows.active += 1;
        else report.saleWindows.expired += 1;
      }

      // Mirror the writer's parent/variant scoping for the expected gallery
      // and attribute sets.
      if (sourceType === 'variation') {
        if (!variant) continue;
        expectedMedia.set(`${variant.productId}:${variant.id}`, {
          sourceId,
          urls: plan.media.map((item) => item.url),
        });
        const specEntry = expectedSpecs.get(variant.productId) ?? {
          sourceId,
          values: new Set<string>(),
        };
        for (const spec of [...plan.parentSpecs, ...plan.customParentSpecs]) {
          specEntry.values.add(`${spec.name}\u0000${spec.value}`);
        }
        expectedSpecs.set(variant.productId, specEntry);
        const axisEntry = expectedAxes.get(variant.id) ?? {
          sourceId,
          values: new Set<string>(),
        };
        for (const axis of plan.variantAxes) {
          axisEntry.values.add(`${axis.name}\u0000${axis.value}`);
        }
        expectedAxes.set(variant.id, axisEntry);
      } else if (product) {
        expectedMedia.set(`${product.id}:`, {
          sourceId,
          urls: plan.media.map((item) => item.url),
        });
        const specEntry = expectedSpecs.get(product.id) ?? {
          sourceId,
          values: new Set<string>(),
        };
        for (const spec of [...plan.specs, ...plan.customSpecs]) {
          specEntry.values.add(`${spec.name}\u0000${spec.value}`);
        }
        expectedSpecs.set(product.id, specEntry);
        // Simple products have a single variant; their display attributes are
        // not a variation matrix. Axis set semantics are verified for
        // variation rows only, where they define the selector.
      }

      if (sourceType === 'variation') {
        if (!variant) continue;
        const mother = cell(row, 'مادر');
        const parent = productBySource.get(mother);
        if (parent && variant.productId !== parent.id) {
          report.parentMismatches.push({
            sourceId,
            expectedParent: mother,
            actualParent: variant.product.sourceId ?? variant.productId,
          });
        }
      } else {
        // Woo lists every ancestor chain and often the shortest first; the
        // importer assigns the deepest chain's leaf (Q5).
        const categoryName = splitCell(cell(row, 'دسته‌ها'))
          .map((chain) =>
            chain
              .split('>')
              .map((part) => part.trim())
              .filter(Boolean),
          )
          .filter((chain) => chain.length > 0)
          .sort((a, b) => b.length - a.length)[0]
          ?.at(-1);
        if (categoryName && product && product.category?.name !== categoryName) {
          report.categoryMissing.push({ sourceId, category: categoryName });
        }
        const brandName = splitCell(cell(row, 'برندها'))[0];
        if (brandName && product) {
          const normalized = normalizeBrandName(brandName);
          const alias =
            normalized === null
              ? undefined
              : refs.brandAliasOwners.get(normalized);
          const acceptable = new Set(
            [brandName, alias?.brand.name].filter(
              (name): name is string => typeof name === 'string',
            ),
          );
          if (
            product.brand?.name === undefined ||
            !acceptable.has(product.brand.name)
          ) {
            report.brandMissing.push({ sourceId, brand: brandName });
          }
        }
      }
    }

    const [specRows, axisRows] = await Promise.all([
      expectedSpecs.size === 0
        ? Promise.resolve([])
        : prisma.productAttributeValue.findMany({
            where: { productId: { in: [...expectedSpecs.keys()] } },
            select: {
              productId: true,
              attribute: { select: { name: true } },
              attributeValue: { select: { value: true } },
            },
          }),
      expectedAxes.size === 0
        ? Promise.resolve([])
        : prisma.variantAttributeValue.findMany({
            where: { variantId: { in: [...expectedAxes.keys()] } },
            select: {
              variantId: true,
              attributeValue: {
                select: {
                  value: true,
                  attribute: { select: { name: true } },
                },
              },
            },
          }),
    ]);
    const actualSpecs = new Map<string, Set<string>>();
    for (const row of specRows) {
      const value = row.attributeValue?.value;
      if (!value) continue;
      const set = actualSpecs.get(row.productId) ?? new Set<string>();
      set.add(`${row.attribute.name}\u0000${value}`);
      actualSpecs.set(row.productId, set);
    }
    for (const [productId, expected] of expectedSpecs) {
      const actual = actualSpecs.get(productId) ?? new Set<string>();
      for (const key of expected.values) {
        if (!actual.has(key)) {
          const [name, value] = key.split('\u0000');
          report.attributeMismatches.push({
            sourceId: expected.sourceId,
            field: 'spec',
            name: name ?? '',
            value: value ?? '',
            state: 'missing',
          });
        }
      }
      for (const key of actual) {
        if (!expected.values.has(key)) {
          const [name, value] = key.split('\u0000');
          report.attributeMismatches.push({
            sourceId: expected.sourceId,
            field: 'spec',
            name: name ?? '',
            value: value ?? '',
            state: 'extra',
          });
        }
      }
    }
    const actualAxes = new Map<string, Set<string>>();
    for (const row of axisRows) {
      const value = row.attributeValue.value;
      const set = actualAxes.get(row.variantId) ?? new Set<string>();
      set.add(`${row.attributeValue.attribute.name}\u0000${value}`);
      actualAxes.set(row.variantId, set);
    }
    for (const [variantId, expected] of expectedAxes) {
      const actual = actualAxes.get(variantId) ?? new Set<string>();
      for (const key of expected.values) {
        if (!actual.has(key)) {
          const [name, value] = key.split('\u0000');
          report.attributeMismatches.push({
            sourceId: expected.sourceId,
            field: 'variantAxis',
            name: name ?? '',
            value: value ?? '',
            state: 'missing',
          });
        }
      }
      for (const key of actual) {
        if (!expected.values.has(key)) {
          const [name, value] = key.split('\u0000');
          report.attributeMismatches.push({
            sourceId: expected.sourceId,
            field: 'variantAxis',
            name: name ?? '',
            value: value ?? '',
            state: 'extra',
          });
        }
      }
    }

    for (const [sku, count] of expectedSkuCounts) {
      if (count > 1) report.duplicateSkus.push({ sku, count });
    }
    const dbSkuCounts = new Map<string, number>();
    for (const variant of variants) {
      dbSkuCounts.set(variant.sku, (dbSkuCounts.get(variant.sku) ?? 0) + 1);
    }
    for (const [sku, count] of dbSkuCounts) {
      if (count > 1 && !report.duplicateSkus.some((row) => row.sku === sku)) {
        report.duplicateSkus.push({ sku, count });
      }
    }

    report.orphansInDb = products
      .filter((product) => product.sourceId && !sourceIdSet.has(product.sourceId))
      .map((product) => ({
        sourceId: product.sourceId as string,
        name: product.name,
        status: product.status,
      }));

    // Primary/media verification for every source product in the CSV.
    const csvProductIds = [
      ...new Set(
        rows
          .filter((row) => cell(row, 'نوع') !== 'variation')
          .map((row) => productBySource.get(cell(row, 'شناسه'))?.id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    report.media.productsChecked = csvProductIds.length;
    const mediaRows = await prisma.productMedia.findMany({
      where: { productId: { in: csvProductIds }, deletedAt: null },
      select: {
        id: true,
        productId: true,
        variantId: true,
        isPrimary: true,
        mediaType: true,
        sourceUrl: true,
        storageKey: true,
        thumbnailKey: true,
        sortOrder: true,
        createdAt: true,
        product: { select: { status: true } },
      },
    });
    const realMedia = mediaRows.filter(
      (m) =>
        m.mediaType === 'IMAGE' &&
        m.sourceUrl !== null &&
        !m.storageKey.startsWith('pending-woo'),
    );
    const actualMedia = new Map<string, typeof realMedia>();
    for (const media of realMedia) {
      const key = `${media.productId}:${media.variantId ?? ''}`;
      const list = actualMedia.get(key) ?? [];
      list.push(media);
      actualMedia.set(key, list);
    }
    for (const rowsInScope of actualMedia.values()) {
      rowsInScope.sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
    }
    for (const [scope, expected] of expectedMedia) {
      const actualUrls = (actualMedia.get(scope) ?? []).map(
        (row) => row.sourceUrl as string,
      );
      const expectedSet = new Set(expected.urls);
      const actualSet = new Set(actualUrls);
      for (const url of expected.urls) {
        if (!actualSet.has(url)) {
          report.media.missing.push({ sourceId: expected.sourceId, url });
        }
      }
      for (const url of actualUrls) {
        if (!expectedSet.has(url)) {
          report.media.extra.push({ sourceId: expected.sourceId, url });
        }
      }
      if (
        expected.urls.length === actualUrls.length &&
        expected.urls.every((url) => actualSet.has(url)) &&
        expected.urls.some((url, index) => url !== actualUrls[index])
      ) {
        report.media.orderMismatches.push({
          sourceId: expected.sourceId,
          expected: expected.urls,
          actual: actualUrls,
        });
      }
    }
    const byProduct = new Map<string, typeof mediaRows>();
    for (const media of mediaRows) {
      const list = byProduct.get(media.productId) ?? [];
      list.push(media);
      byProduct.set(media.productId, list);
    }
    for (const productId of csvProductIds) {
      const list = byProduct.get(productId) ?? [];
      const primaries = list.filter(
        (m) =>
          m.isPrimary &&
          m.mediaType === 'IMAGE' &&
          !m.storageKey.startsWith('pending-woo'),
      );
      const expectedCount = expectedMedia.get(`${productId}:`)?.urls.length ?? 0;
      // An intentionally imageless source row is not a media failure.
      if (expectedCount > 0 && primaries.length === 0) {
        report.media.primaryMissing.push(productId);
      }
      if (primaries.length > 1) report.media.multiplePrimary.push(productId);
    }

    if (!skipMediaHttp) {
      // Public media only exists for PUBLISHED products and real binaries;
      // legacy `pending-woo:*` placeholders are intentional non-public rows.
      const candidates = mediaRows.filter(
        (m) =>
          m.mediaType === 'IMAGE' &&
          m.product.status === 'PUBLISHED' &&
          !m.storageKey.startsWith('pending-woo'),
      );
      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, () =>
        (async () => {
          while (cursor < candidates.length) {
            const media = candidates[cursor];
            cursor += 1;
            if (!media) return;
            const result = await httpOk(apiBase, media.id);
            report.media.publicChecked += 1;
            if (!result.ok) {
              report.media.publicFailed.push({
                mediaId: media.id,
                status: result.status,
                error: result.error,
              });
            }
          }
        })(),
      );
      await Promise.all(workers);
    }

    report.ok =
      report.missingProducts.length === 0 &&
      report.missingVariants.length === 0 &&
      report.duplicateSkus.length === 0 &&
      report.parentMismatches.length === 0 &&
      report.categoryMissing.length === 0 &&
      report.brandMissing.length === 0 &&
      report.priceMismatches.length === 0 &&
      report.attributeMismatches.length === 0 &&
      report.media.extra.length === 0 &&
      report.media.orderMismatches.length === 0 &&
      (report.media.allowMissing || report.media.missing.length === 0) &&
      report.media.primaryMissing.length === 0 &&
      report.media.multiplePrimary.length === 0 &&
      report.media.publicFailed.length === 0;

    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(
      [
        `WooCommerce reconciliation: ${rows.length} rows from ${input}`,
        `missing products ${report.missingProducts.length} / missing variants ${report.missingVariants.length}`,
        `SKU mismatches/duplicates ${report.priceMismatches.filter((r) => r.field === 'sku').length}/${report.duplicateSkus.length} / parent mismatches ${report.parentMismatches.length}`,
        `price mismatches ${report.priceMismatches.filter((r) => r.field !== 'sku').length} / category ${report.categoryMissing.length} / brand ${report.brandMissing.length} / attributes ${report.attributeMismatches.length}`,
        `sale windows scheduled ${report.saleWindows.scheduled} (active ${report.saleWindows.active}, expired ${report.saleWindows.expired})`,
        `media products ${report.media.productsChecked}, missing ${report.media.missing.length}, extra ${report.media.extra.length}, order ${report.media.orderMismatches.length}, primary missing ${report.media.primaryMissing.length}, multiple primary ${report.media.multiplePrimary.length}`,
        report.media.httpSkipped
          ? 'public media HTTP check: skipped'
          : `public media checked ${report.media.publicChecked}, failed ${report.media.publicFailed.length}`,
        `orphans in DB (preserved, not deleted): ${report.orphansInDb.length}`,
        `result: ${report.ok ? 'OK' : 'MISMATCHES FOUND'}`,
        `report artifact: ${out}`,
      ].join('\n'),
    );
    if (!report.ok) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
