#!/usr/bin/env tsx
/**
 * Catalog data-scrub CLI (SS-228).
 *
 * One idempotent pass over the imported catalog:
 *   1. Newline scrub — literal `\n` sequences (a Woo-export artifact) inside
 *      shortDescription/description collapse to single spaces.
 *   2. Brand alias merge — EN/FA duplicate brand entities (SS-207 imported
 *      both spellings as separate brands) re-point to the higher-volume
 *      entity; the duplicate is soft-deleted.
 *   3. Category merge — the stray «ابزار» root (O-3) re-parents under
 *      «کالای دیجیتال» and is soft-deleted.
 *
 * Every step is idempotent: a second run reports zero work. Runs against
 * DATABASE_URL; `--apply` writes, the default is a dry-run report.
 *
 * Usage:
 *   pnpm --filter @sabz/api exec tsx src/modules/import/cli/scrub.ts [--apply]
 */
import { PrismaService } from '../../../common/database/prisma.service';

const NEWLINE_ARTIFACT = / *\\n */g;

/** Verified alias pairs (SS-228): [keep-slug, drop-slug] — keep = higher product volume. */
const BRAND_MERGES: ReadonlyArray<readonly [string, string]> = [
  ['vryty', 'verity'], // وریتی 144 / Verity 3
  ['ay-dyta', 'adata'], // ای دیتا 54 / adata 2
  ['green-lion-2', 'green-lion'], // Green Lion 53 / گرین لاین 7
  ['avrykv', 'orico'], // اوریکو 12 / orico 10
  ['porodo-2', 'porodo'], // Porodo 38 / پرودو 2
  ['powerology-2', 'powerology'], // Powerology 16 / پاورولوژی 3
  ['biva-2', 'biva'], // Biva 4 / بیوا 1
];

const TRUNK_SLUG = 'digital-goods';
const STRAY_ROOT_SLUG = 'abzar';

interface StepReport {
  step: string;
  detail: string;
  affected: number;
}

function collapseNewlineArtifacts(text: string): string {
  return text.replace(NEWLINE_ARTIFACT, ' ').replace(/ {2,}/g, ' ').trim();
}

async function scrubNewlines(
  prisma: PrismaService,
  apply: boolean,
): Promise<StepReport> {
  const rows = await prisma.product.findMany({
    where: {
      deletedAt: null,
      OR: [
        { shortDescription: { contains: '\\n' } },
        { description: { contains: '\\n' } },
      ],
    },
    select: { id: true, shortDescription: true, description: true },
  });

  let shortFixed = 0;
  let longFixed = 0;
  for (const row of rows) {
    const shortNext = row.shortDescription
      ? collapseNewlineArtifacts(row.shortDescription)
      : row.shortDescription;
    const longNext = row.description
      ? collapseNewlineArtifacts(row.description)
      : row.description;
    if (shortNext !== row.shortDescription) {
      shortFixed += 1;
    }
    if (longNext !== row.description) {
      longFixed += 1;
    }
    if (apply) {
      await prisma.product.update({
        where: { id: row.id },
        data: { shortDescription: shortNext, description: longNext },
      });
    }
  }
  return {
    step: 'newline-scrub',
    detail: `${rows.length} products scanned; short=${shortFixed}, description=${longFixed}`,
    affected: rows.length,
  };
}

async function mergeBrands(
  prisma: PrismaService,
  apply: boolean,
): Promise<StepReport> {
  let moved = 0;
  let deleted = 0;
  const detailParts: string[] = [];
  for (const [keepSlug, dropSlug] of BRAND_MERGES) {
    const [keep, drop] = await Promise.all([
      prisma.brand.findFirst({ where: { slug: keepSlug, deletedAt: null } }),
      prisma.brand.findFirst({ where: { slug: dropSlug, deletedAt: null } }),
    ]);
    if (!keep) {
      detailParts.push(`${keepSlug}: missing keep entity`);
      continue;
    }
    if (!drop) {
      detailParts.push(`${dropSlug}: already merged`);
      continue;
    }
    const count = await prisma.product.count({
      where: { brandId: drop.id, deletedAt: null },
    });
    moved += count;
    detailParts.push(`${dropSlug}→${keepSlug}: ${count} products`);
    if (apply) {
      await prisma.$transaction([
        prisma.product.updateMany({
          where: { brandId: drop.id },
          data: { brandId: keep.id },
        }),
        prisma.brand.update({
          where: { id: drop.id },
          data: { deletedAt: new Date() },
        }),
      ]);
    } else {
      deleted += 1;
    }
  }
  return {
    step: 'brand-merge',
    detail: detailParts.join(' · '),
    affected: apply ? moved : deleted,
  };
}

async function mergeStrayRoot(
  prisma: PrismaService,
  apply: boolean,
): Promise<StepReport> {
  const [trunk, stray] = await Promise.all([
    prisma.category.findFirst({ where: { slug: TRUNK_SLUG, deletedAt: null } }),
    prisma.category.findFirst({ where: { slug: STRAY_ROOT_SLUG, deletedAt: null } }),
  ]);
  if (!trunk) {
    return { step: 'category-merge', detail: `${TRUNK_SLUG}: missing`, affected: 0 };
  }
  if (!stray) {
    return { step: 'category-merge', detail: `${STRAY_ROOT_SLUG}: already merged`, affected: 0 };
  }
  const children = await prisma.category.findMany({
    where: { parentId: stray.id, deletedAt: null },
    select: { id: true, slug: true },
  });
  if (apply) {
    await prisma.$transaction([
      ...children.map((child) =>
        prisma.category.update({
          where: { id: child.id },
          data: { parentId: trunk.id },
        }),
      ),
      prisma.category.update({
        where: { id: stray.id },
        data: { deletedAt: new Date() },
      }),
    ]);
  }
  return {
    step: 'category-merge',
    detail: `${STRAY_ROOT_SLUG}: ${children.length} children (${children
      .map((child) => child.slug)
      .join(', ')}) re-parented under ${TRUNK_SLUG}`,
    affected: children.length,
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const reports = [
      await scrubNewlines(prisma, apply),
      await mergeBrands(prisma, apply),
      await mergeStrayRoot(prisma, apply),
    ];
    console.log(`catalog-scrub ${apply ? 'APPLY' : 'DRY-RUN'}`);
    for (const report of reports) {
      console.log(`  ${report.step}: ${report.detail}`);
    }
    console.log(
      apply
        ? 'Done. Re-run without --apply to verify idempotency.'
        : 'Dry-run only — re-run with --apply to write.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
