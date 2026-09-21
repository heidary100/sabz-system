#!/usr/bin/env tsx
/**
 * WooCommerce import writer CLI (SS-207).
 *
 * Turns SS-206 dry-run verdicts into real, re-runnable writes: upserts
 * products/variants by source identity with inventory receipts and full
 * ImportRun/ImportRecord audit. Per-row isolation: one bad row never aborts
 * the run. Re-runs resume by skipping IMPORTED/UPDATED rows with unchanged
 * hashes (pass --no-resume to force full reprocessing).
 *
 * Media binaries are SS-208: by default no media rows are written
 * (--skip-media is the default); pass --with-media-refs to store reference
 * placeholders the downloader will later backfill.
 *
 * Usage:
 *   pnpm --filter @sabz/api woo:import -- --file <export.csv> [--out <report.json>] [--limit N] [--with-media-refs] [--failure-threshold N] [--no-resume]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../../../common/database/prisma.service';
import { renderWriteSummary, WooRunner } from '../woo-runner';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
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
  const thresholdRaw = arg('failure-threshold');
  const failureThreshold =
    thresholdRaw === undefined ? 0 : Number(thresholdRaw);
  if (
    thresholdRaw !== undefined &&
    (!Number.isInteger(failureThreshold) || failureThreshold < 0)
  ) {
    throw new Error('--failure-threshold must be a non-negative integer.');
  }
  const outArg = arg('out');
  const out =
    outArg === undefined ? `${input}.import.json` : resolve(process.cwd(), outArg);

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const runner = new WooRunner(prisma);
    const { report, exitCode } = await runner.runImport({
      file: input,
      limit,
      includeMediaRefs: flag('with-media-refs'),
      failureThreshold,
      resume: !flag('no-resume'),
    });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(renderWriteSummary(report));
    console.log(`report artifact: ${out}`);
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
