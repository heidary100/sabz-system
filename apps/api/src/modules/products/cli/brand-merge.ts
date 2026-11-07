#!/usr/bin/env tsx
/**
 * SS-258 curated brand merge CLI.
 *
 * Default is a read-only dry-run. `--apply` writes one serializable
 * transaction after re-running every precondition under an advisory lock.
 * The mapping is curated in `brand-merge.ts`; no fuzzy or automatic
 * transliteration is ever performed.
 *
 * Usage:
 *   pnpm --filter @sabz/api brand:merge -- --dry-run --json /tmp/ss258.json
 *   pnpm --filter @sabz/api brand:merge -- --apply --confirm=sabz --include-biva
 */
import { readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/database/prisma.service';
import { StorefrontCacheService } from '../../../common/storefront-cache/storefront-cache.service';
import {
  BrandMergeBlockedError,
  runBrandMerge,
  type BrandMergeReport,
} from '../brand-merge';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline !== undefined) {
    return inline.slice(prefix.length);
  }
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseTarget(databaseUrl: string): { host: string; database: string; schema: string } {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    database: url.pathname.replace(/^\//, ''),
    schema: url.searchParams.get('schema') ?? 'public',
  };
}

function snapshotFromReport(report: BrandMergeReport): Record<string, unknown> {
  return {
    mappings: report.mappings.map((mapping) => ({
      brandLabel: mapping.brandLabel,
      canonicalId: mapping.canonical.id,
      canonicalSlug: mapping.canonical.slug,
      duplicateId: mapping.duplicate.id,
      duplicateSlug: mapping.duplicate.slug,
      duplicateDeletedAt: mapping.duplicate.deletedAt,
      productsAll: mapping.duplicate.productsAll,
      promotions: mapping.duplicate.promotions,
    })),
    brandTotal: report.preflight.brandTotal,
    brandActive: report.preflight.brandActive,
  };
}

function assertExpectation(path: string, report: BrandMergeReport): void {
  const expected = JSON.parse(readFileSync(path, 'utf8')) as BrandMergeReport;
  const before = snapshotFromReport(expected);
  const now = snapshotFromReport(report);
  if (JSON.stringify(before) !== JSON.stringify(now)) {
    throw new Error(
      `Apply preconditions differ from the reviewed dry-run "${path}". Re-run the dry-run and review the changes.`,
    );
  }
}

function renderSummary(report: BrandMergeReport): string {
  const lines = [
    `SS-258 brand merge (${report.mode})`,
    `brands: ${report.preflight.brandActive} active / ${report.preflight.brandTotal} total (${report.preflight.brandDeleted} deleted)`,
    `products: ${report.preflight.brandedProducts} branded / ${report.preflight.unbrandedProducts} unbranded`,
    `promotions: ${report.preflight.promotions}`,
    `status: ${report.status}`,
  ];
  for (const mapping of report.mappings) {
    lines.push(
      `  ${mapping.brandLabel} [${mapping.status}]: ${mapping.duplicate.slug} -> ${mapping.canonical.slug} · products ${mapping.operations.productsReassigned} · promotions ${mapping.operations.promotionsReassigned}`,
    );
    for (const conflict of mapping.conflicts) {
      lines.push(`    CONFLICT: ${conflict}`);
    }
  }
  if (report.aliasCollisions.length > 0) {
    lines.push('alias collisions:');
    for (const collision of report.aliasCollisions) {
      lines.push(
        `  ${collision.normalizedKey}: ${collision.members.map((member) => member.slug).join(', ')}`,
      );
    }
  }
  lines.push(
    report.mode === 'apply'
      ? `applied; changes ${report.totals.changes}; active brands now ${report.totals.brandActiveAfter}`
      : `expected active brands after apply: ${report.totals.brandActiveAfter}`,
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const apply = flag('apply');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }
  const target = parseTarget(databaseUrl);
  console.log(`target: host=${target.host} db=${target.database} schema=${target.schema}`);

  if (apply) {
    const confirm = arg('confirm');
    if (!confirm || confirm !== target.database) {
      throw new Error(
        `--apply requires --confirm=${target.database} (the target database name).`,
      );
    }
    if (
      (process.env.NODE_ENV === 'production' || target.host !== 'localhost') &&
      !flag('allow-production')
    ) {
      throw new Error(
        'Refusing apply outside localhost without --allow-production.',
      );
    }
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const report = await runBrandMerge(prisma, {
      apply,
      includeBiva: flag('include-biva'),
      invalidateCache: apply
        ? async (tags) => {
            const cache = new StorefrontCacheService(new ConfigService());
            for (let index = 0; index < tags.length; index += 60) {
              await cache.invalidate(tags.slice(index, index + 60));
            }
          }
        : undefined,
    });

    if (apply) {
      const expect = arg('expect');
      if (expect) {
        assertExpectation(expect, report);
      }
    }

    const jsonPath = arg('json');
    if (jsonPath) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      console.log(`report artifact: ${jsonPath}`);
    }

    console.log(renderSummary(report));
    if (report.status === 'blocked') {
      process.exitCode = 2;
    }
  } catch (error) {
    if (error instanceof BrandMergeBlockedError) {
      console.error('SS-258 brand merge blocked; no writes were committed.');
      for (const conflict of error.conflicts) {
        console.error(`  - ${conflict}`);
      }
      process.exitCode = 2;
      return;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
