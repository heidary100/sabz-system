#!/usr/bin/env tsx
/**
 * WooCommerce dry-run CLI (SS-206).
 *
 * Parses the export, resolves every row to an import verdict, and writes the
 * report matrix — without a single database write. Reference data (categories,
 * brands, slugs, SKUs, source keys) is read from DATABASE_URL.
 *
 * Usage:
 *   pnpm --filter @sabz/api woo:dry-run -- --file <export.csv> [--out <report.json>] [--limit N]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../../../common/database/prisma.service';
import { parseWooCsvFile, splitCell } from '../woo-parse';
import { WooReferenceLoader } from '../woo-reference';
import {
  buildFileIndex,
  createClaimants,
  resolveRow,
} from '../woo-resolve';
import { attachImageIndex, buildReport, renderSummary } from '../woo-report';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const file = arg('file');
  if (!file) {
    throw new Error('Missing required --file <woocommerce-export.csv>.');
  }
  const input = resolve(process.cwd(), file);
  const limitRaw = arg('limit');
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limitRaw !== undefined && (!Number.isInteger(limit) || (limit as number) <= 0)) {
    throw new Error('--limit must be a positive integer.');
  }
  const outArg = arg('out');
  const out =
    outArg === undefined ? `${input}.dry-run.json` : resolve(process.cwd(), outArg);

  const parsed = parseWooCsvFile(input, limit);
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const refs = await new WooReferenceLoader(prisma).load();
    const index = buildFileIndex(parsed.rows);
    const claimants = createClaimants(refs);
    const verdicts = [];
    const imageUrls: string[] = [];
    for (const record of parsed.rows) {
      const verdict = await resolveRow(record, refs, index, claimants);
      verdicts.push(verdict);
      for (const url of splitCell(record.cells['تصاویر'] ?? '')) {
        imageUrls.push(url);
      }
      const second = (record.cells['متا: second_image'] ?? '').trim();
      if (second) {
        imageUrls.push(second);
      }
    }
    const report = buildReport(input, parsed.header, verdicts, {
      categories: refs.categories.length,
      brands: refs.brands.length,
      knownSourceKeys: refs.sourceKeys.size,
    });
    attachImageIndex(report, imageUrls);
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(renderSummary(report));
    console.log(`report artifact: ${out}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
