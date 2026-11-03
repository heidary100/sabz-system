import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { searchCatalogProducts } from '../src/modules/products/public-catalog-search';

/**
 * SS-264 frozen-instrument runner (dev catalog, report-only — never CI).
 *
 * Executes BOTH committed regression instruments against the LIVE dev
 * catalog through the REAL search builder (`searchCatalogProducts`):
 *
 *   1. the 32-query recall battery  (test/fixtures/ss264-search/recall-battery.json)
 *   2. the 10-query labeled top-5 precision set (precision-labels.json)
 *
 * Relevance rules from the labels file are resolved against the live
 * catalog per the human-approved `relevanceRule` in each entry; the CI
 * regression spec holds its own hermetic fixture identities and is the
 * binding oracle — this script is the before/after evidence artifact the
 * PR pastes (audit §A.3 baseline, frozen 2026-10-24).
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @sabz/api exec tsx scripts/search-instruments.ts [--json]
 */

const prisma = new PrismaClient();
const FIXTURES = join(__dirname, '..', 'test', 'fixtures', 'ss264-search');

interface BatteryQuery {
  q: string;
  expect: 'hits' | 'zero';
  class: string;
  frozenCount20261024?: number;
}

interface RelevanceRule {
  nameContains?: string;
  nameEnContains?: string;
  auxContains?: string;
  brandName?: string;
}

interface LabelQuery {
  q: string;
  frozenFrom: string;
  v0Score?: number;
  relevanceRule: RelevanceRule;
  relevantNote?: string;
}

interface BatteryReport {
  q: string;
  cls: string;
  expect: string;
  total: number;
  pass: boolean;
  frozenCount20261024?: number;
  ms: number;
}

interface PrecisionReport {
  q: string;
  frozenFrom: string;
  v0Score?: number;
  top5: { name: string; brand: string; sku: string; relevant: boolean }[];
  hits: number;
  top5Size: number;
  pAt5: number;
}

/** Resolves a human relevance rule into the set of relevant PRODUCT ids. */
async function resolveRelevantIds(rule: RelevanceRule): Promise<Set<string>> {
  const ids = new Set<string>();
  if (rule.nameContains) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT p."id" FROM "Product" p
      WHERE p."deletedAt" IS NULL AND p."status" = 'PUBLISHED'
        AND normalize_fa(p."name") LIKE ${'%' + rule.nameContains + '%'}`;
    rows.forEach((r) => ids.add(r.id));
  }
  if (rule.nameEnContains) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT p."id" FROM "Product" p
      WHERE p."deletedAt" IS NULL AND p."status" = 'PUBLISHED'
        AND normalize_fa(coalesce(p."nameEn", '')) LIKE ${'%' + rule.nameEnContains + '%'}`;
    rows.forEach((r) => ids.add(r.id));
  }
  if (rule.auxContains) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT p."id" FROM "Product" p
      WHERE p."deletedAt" IS NULL AND p."status" = 'PUBLISHED'
        AND normalize_fa(coalesce(p."subtitle", '') || ' ' || coalesce(p."focusKeyword", ''))
          LIKE ${'%' + rule.auxContains + '%'}`;
    rows.forEach((r) => ids.add(r.id));
  }
  if (rule.brandName) {
    const rows = await prisma.product.findMany({
      where: {
        deletedAt: null,
        status: 'PUBLISHED',
        brand: { is: { name: rule.brandName, deletedAt: null } },
      },
      select: { id: true },
    });
    rows.forEach((r) => ids.add(r.id));
  }
  return ids;
}

async function searchTop(q: string, limit: number): Promise<{ ids: string[]; total: number; ms: number }> {
  const started = Date.now();
  const { total, pageIds } = await searchCatalogProducts(prisma, {
    tokens: [q],
    filters: {},
    sort: 'relevance',
    page: 1,
    limit,
  });
  return { ids: pageIds, total, ms: Date.now() - started };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

async function main(): Promise<void> {
  const asJson = process.argv.includes('--json');
  const battery = JSON.parse(
    readFileSync(join(FIXTURES, 'recall-battery.json'), 'utf8'),
  ) as { queries: BatteryQuery[] };
  const labels = JSON.parse(
    readFileSync(join(FIXTURES, 'precision-labels.json'), 'utf8'),
  ) as { queries: LabelQuery[] };

  const batteryReport: BatteryReport[] = [];
  for (const { q, expect: exp, class: cls, frozenCount20261024 } of battery.queries) {
    const { total, ms } = await searchTop(q, 1);
    batteryReport.push({
      q,
      cls,
      expect: exp,
      total,
      pass: exp === 'hits' ? total >= 1 : total === 0,
      ...(frozenCount20261024 !== undefined ? { frozenCount20261024 } : {}),
      ms,
    });
  }

  const precisionReport: PrecisionReport[] = [];
  for (const { q, frozenFrom, v0Score, relevanceRule } of labels.queries) {
    const relevant = await resolveRelevantIds(relevanceRule);
    const { ids } = await searchTop(q, 5);
    const rows = ids.length
      ? await prisma.product.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            name: true,
            brand: { select: { name: true } },
            variants: { select: { sku: true }, where: { deletedAt: null } },
          },
        })
      : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const top5 = ids.map((id) => {
      const p = byId.get(id);
      return {
        name: p?.name ?? id,
        brand: p?.brand?.name ?? '-',
        sku: (p?.variants ?? []).map((v) => v.sku).join(','),
        relevant: relevant.has(id),
      };
    });
    const hits = top5.filter((r) => r.relevant).length;
    precisionReport.push({
      q,
      frozenFrom,
      ...(v0Score !== undefined ? { v0Score } : {}),
      top5,
      hits,
      top5Size: ids.length,
      pAt5: ids.length === 0 ? 0 : hits / Math.min(5, ids.length),
    });
  }

  const batteryFailures = batteryReport.filter((r) => !r.pass);
  const avgPrecision =
    precisionReport.reduce((sum, r) => sum + r.pAt5, 0) / (precisionReport.length || 1);
  const batteryLatencies = batteryReport.map((r) => r.ms);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          battery: {
            total: batteryReport.length,
            failures: batteryFailures.length,
            p50Ms: percentile(batteryLatencies, 50),
            results: batteryReport,
          },
          precision: {
            averagePAt5: Number(avgPrecision.toFixed(3)),
            threshold: 0.9,
            pass: avgPrecision >= 0.9,
            results: precisionReport,
          },
        },
        null,
        2,
      ),
    );
  } else {
    console.log('=== RECALL BATTERY ===');
    for (const r of batteryReport) {
      const anchor =
        r.frozenCount20261024 !== undefined ? ` (frozen §A.3: ${r.frozenCount20261024})` : '';
      console.log(
        `${r.pass ? 'PASS' : 'FAIL'} [${r.cls}] q=${r.q} total=${r.total}${anchor} ${r.ms}ms`,
      );
    }
    console.log(
      `battery failures: ${batteryFailures.length}/${batteryReport.length}` +
        (batteryFailures.length
          ? ` → ${batteryFailures.map((r) => r.q).join(', ')}`
          : ''),
    );
    console.log(`battery p50 (DB-level): ${percentile(batteryLatencies, 50)}ms`);

    console.log('\n=== LABELED PRECISION (top-5) ===');
    for (const r of precisionReport) {
      console.log(
        `q=${r.q} (${r.frozenFrom}${r.v0Score !== undefined ? `, v0=${r.v0Score}` : ''}) ` +
          `P@5=${r.pAt5.toFixed(1)} hits=${r.hits}/${r.top5Size}`,
      );
      r.top5.forEach((row, i) =>
        console.log(
          `  ${i + 1}. [${row.relevant ? 'R' : '.'}] ${row.name} | brand=${row.brand} | ${row.sku}`,
        ),
      );
    }
    console.log(
      `\naverage P@5 = ${avgPrecision.toFixed(3)} (target >= 0.9) — ${avgPrecision >= 0.9 ? 'PASS' : 'FAIL'}`,
    );
  }
  await prisma.$disconnect();
  if (batteryFailures.length > 0 || avgPrecision < 0.9) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
