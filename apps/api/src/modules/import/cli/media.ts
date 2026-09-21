#!/usr/bin/env tsx
/**
 * WooCommerce bulk media downloader CLI (SS-208).
 *
 * Downloads referenced product images through the standard watermark +
 * thumbnail pipeline and backfills the SS-207 `pending-woo:*` placeholders
 * in place. Re-runs skip on `(productId, sourceUrl|contentHash)` — no
 * duplicate media. Per-image isolation: one bad URL never aborts the run.
 *
 * Prerequisites: run the SS-207 product writer first (`woo:import`), ideally
 * with `--with-media-refs` so placeholders carry CSV ordering.
 *
 * Usage:
 *   pnpm --filter @sabz/api woo:media -- --file <export.csv> [--out <report.json>] [--limit N]
 *     [--concurrency 6] [--allow-host cdn.example.com,...] [--allow-private]
 *     [--dry-run] [--failure-threshold N] [--no-resume]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../../../common/database/prisma.service';
import { createWooMediaRunner, renderMediaSummary } from '../woo-media-runner';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function argsAll(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1] !== undefined) {
      values.push(process.argv[i + 1] as string);
    }
  }
  return values;
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
  const concurrencyRaw = arg('concurrency');
  const concurrency = concurrencyRaw === undefined ? undefined : Number(concurrencyRaw);
  if (
    concurrencyRaw !== undefined &&
    (!Number.isInteger(concurrency) || (concurrency as number) <= 0)
  ) {
    throw new Error('--concurrency must be a positive integer.');
  }
  const thresholdRaw = arg('failure-threshold');
  const failureThreshold = thresholdRaw === undefined ? 0 : Number(thresholdRaw);
  if (
    thresholdRaw !== undefined &&
    (!Number.isInteger(failureThreshold) || failureThreshold < 0)
  ) {
    throw new Error('--failure-threshold must be a non-negative integer.');
  }
  const allowHosts = argsAll('allow-host')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const outArg = arg('out');
  const out =
    outArg === undefined ? `${input}.media.json` : resolve(process.cwd(), outArg);

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const runner = createWooMediaRunner(prisma);
    const { report, exitCode } = await runner.runMedia({
      file: input,
      limit,
      concurrency,
      allowHosts,
      allowPrivate: flag('allow-private'),
      dryRun: flag('dry-run'),
      failureThreshold,
      resume: !flag('no-resume'),
    });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(renderMediaSummary(report));
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
