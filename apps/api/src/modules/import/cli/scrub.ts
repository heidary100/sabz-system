#!/usr/bin/env tsx
/**
 * Catalog data-scrub CLI (SS-228).
 *
 * One idempotent pass over the imported catalog:
 *   1. Newline scrub — literal `\n` sequences (a Woo-export artifact) inside
 *      shortDescription/description collapse to single spaces.
 *   2. Category merge — the stray «ابزار» root (O-3) re-parents under
 *      «کالای دیجیتال» and is soft-deleted.
 *
 * Brand alias merging moved to the SS-258 `brand:merge` CLI. The old
 * volume-based mapping here conflicted with the seed-canonical direction and
 * would have undone SS-258 if re-run; it was removed deliberately.
 *
 * Every step is idempotent: a second run reports zero work. Runs against
 * DATABASE_URL; `--apply` writes, the default is a dry-run report.
 *
 * Usage:
 *   pnpm --filter @sabz/api exec tsx src/modules/import/cli/scrub.ts [--apply]
 */
import { PrismaService } from '../../../common/database/prisma.service';

const NEWLINE_ARTIFACT = / *\\n */g;

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
