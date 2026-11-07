import { BrandAliasKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  addBrandAlias,
  ensureBrandAliases,
  findBrandAliasCollisions,
  moveBrandAliases,
  syncAllBrandAliases,
  type AliasCollision,
} from './brand-alias';
import { brandNameKeys } from './brand-normalize';

/**
 * SS-258 curated brand merge (deterministic, no fuzzy matching).
 *
 * Canonical records are the seed/unsuffixed-slug records: the seed fixture is
 * the canonical catalog source and `seed-catalog.ts` deliberately refuses to
 * resurrect a merged-away seed brand. The English importer artifacts hold the
 * products; this script moves those products to the canonical record and
 * soft-deletes the artifact.
 */

export type BrandMergeMode = 'merge' | 'link-already-deleted';

export interface BrandMergeMapping {
  brandLabel: string;
  canonicalSlug: string;
  duplicateSlug: string;
  expectedCanonicalName: string;
  expectedCanonicalNameEn: string | null;
  expectedDuplicateName: string;
  expectedDuplicateNameEn: string | null;
  mode: BrandMergeMode;
}

/**
 * The three SS-258 pairs. Biva is intentionally separate below: it is a
 * probable fourth duplicate already present in the SS-228 scrub mapping but
 * requires explicit sign-off before SS-258 may merge it.
 */
export const SS258_ACTIVE_MERGES: readonly BrandMergeMapping[] = [
  {
    brandLabel: 'Green Lion',
    canonicalSlug: 'green-lion',
    duplicateSlug: 'green-lion-2',
    expectedCanonicalName: 'گرین لاین',
    expectedCanonicalNameEn: 'Green Lion',
    expectedDuplicateName: 'Green Lion',
    expectedDuplicateNameEn: null,
    mode: 'merge',
  },
  {
    brandLabel: 'Porodo',
    canonicalSlug: 'porodo',
    duplicateSlug: 'porodo-2',
    expectedCanonicalName: 'پرودو',
    expectedCanonicalNameEn: 'Porodo',
    expectedDuplicateName: 'Porodo',
    expectedDuplicateNameEn: null,
    mode: 'merge',
  },
  {
    brandLabel: 'Powerology',
    canonicalSlug: 'powerology',
    duplicateSlug: 'powerology-2',
    expectedCanonicalName: 'پاورولوژی',
    expectedCanonicalNameEn: 'Powerology',
    expectedDuplicateName: 'Powerology',
    expectedDuplicateNameEn: null,
    mode: 'merge',
  },
];

/** Optional fourth pair; pass `includeBiva` only after explicit sign-off. */
export const SS258_BIVA_MERGE: BrandMergeMapping = {
  brandLabel: 'Biva',
  canonicalSlug: 'biva',
  duplicateSlug: 'biva-2',
  expectedCanonicalName: 'بیوا',
  expectedCanonicalNameEn: 'Biva',
  expectedDuplicateName: 'Biva',
  expectedDuplicateNameEn: null,
  mode: 'merge',
};

/**
 * Pairs already merged by the SS-228 scrub. No products remain on the
 * duplicate; SS-258 only makes the relationship explicit and protects the
 * former name via aliases.
 */
export const SS258_LINK_ONLY_MERGES: readonly BrandMergeMapping[] = [
  {
    brandLabel: 'Adata',
    canonicalSlug: 'ay-dyta',
    duplicateSlug: 'adata',
    expectedCanonicalName: 'ای دیتا',
    expectedCanonicalNameEn: null,
    expectedDuplicateName: 'adata',
    expectedDuplicateNameEn: null,
    mode: 'link-already-deleted',
  },
  {
    brandLabel: 'Orico',
    canonicalSlug: 'avrykv',
    duplicateSlug: 'orico',
    expectedCanonicalName: 'اوریکو',
    expectedCanonicalNameEn: null,
    expectedDuplicateName: 'orico',
    expectedDuplicateNameEn: null,
    mode: 'link-already-deleted',
  },
  {
    brandLabel: 'Verity',
    canonicalSlug: 'vryty',
    duplicateSlug: 'verity',
    expectedCanonicalName: 'وریتی',
    expectedCanonicalNameEn: null,
    expectedDuplicateName: 'Verity',
    expectedDuplicateNameEn: null,
    mode: 'link-already-deleted',
  },
];

export interface BrandMergeOptions {
  apply: boolean;
  includeBiva?: boolean;
  actorId?: string;
  /** Optional post-commit cache invalidation callback. */
  invalidateCache?: (tags: string[]) => void | Promise<void>;
}

export interface BrandSnapshot {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  description: string | null;
  logoKey: string | null;
  isFeatured: boolean;
  deletedAt: Date | null;
  mergedIntoBrandId: string | null;
  productsLive: number;
  productsAll: number;
  productSlugs: string[];
  promotions: number;
}

export interface PromotionSnapshot {
  id: string;
  code: string;
  brandId: string | null;
  productId: string | null;
  categoryId: string | null;
  type: string;
  value: string;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  minQuantity: number;
}

export interface BrandMergeMappingReport {
  brandLabel: string;
  mode: BrandMergeMode;
  status: 'ready' | 'already-merged' | 'link' | 'blocked';
  canonical: BrandSnapshot;
  duplicate: BrandSnapshot;
  conflicts: string[];
  expected: {
    canonicalProductsLive: number;
    canonicalProductsAll: number;
    duplicateProductsAfter: number;
    canonicalSlugAfter: string;
    duplicateDeleted: boolean;
    duplicateMergedInto: string | null;
  };
  operations: {
    productsReassigned: number;
    promotionsReassigned: number;
    aliasKeys: string[];
    softDelete: boolean;
    setMergedInto: boolean;
  };
}

export interface BrandMergeReport {
  mode: 'dry-run' | 'apply';
  generatedAt: string;
  mappings: BrandMergeMappingReport[];
  aliasCollisions: AliasCollision[];
  preflight: {
    brandTotal: number;
    brandActive: number;
    brandDeleted: number;
    brandedProducts: number;
    unbrandedProducts: number;
    promotions: number;
  };
  totals: {
    brandActiveAfter: number;
    brandTotalAfter: number;
    changes: number;
  };
  status: 'ready' | 'blocked' | 'applied';
}

export class BrandMergeBlockedError extends Error {
  constructor(readonly conflicts: string[]) {
    super(`Brand merge blocked: ${conflicts.join('; ')}`);
    this.name = 'BrandMergeBlockedError';
  }
}

const MERGE_ACTOR = 'ss-258-brand-merge';

function selectedMappings(options: BrandMergeOptions): BrandMergeMapping[] {
  return [
    ...SS258_ACTIVE_MERGES,
    ...(options.includeBiva ? [SS258_BIVA_MERGE] : []),
    ...SS258_LINK_ONLY_MERGES,
  ];
}

function dateKey(value: Date): number {
  return value.getTime();
}

function overlaps(a: PromotionSnapshot, b: PromotionSnapshot): boolean {
  return dateKey(a.startsAt) <= dateKey(b.endsAt) && dateKey(b.startsAt) <= dateKey(a.endsAt);
}

function isActiveNow(promo: PromotionSnapshot, now: Date): boolean {
  return (
    promo.isActive &&
    dateKey(promo.startsAt) <= dateKey(now) &&
    dateKey(promo.endsAt) >= dateKey(now)
  );
}

function equivalentPromotion(a: PromotionSnapshot, b: PromotionSnapshot): boolean {
  return (
    a.type === b.type &&
    a.value === b.value &&
    a.minQuantity === b.minQuantity &&
    dateKey(a.startsAt) === dateKey(b.startsAt) &&
    dateKey(a.endsAt) === dateKey(b.endsAt)
  );
}

function isBrandScoped(promo: PromotionSnapshot): boolean {
  return promo.productId === null && promo.categoryId === null;
}

export function findPromotionCollisions(
  canonicalPromotions: PromotionSnapshot[],
  duplicatePromotions: PromotionSnapshot[],
  now = new Date(),
): string[] {
  const conflicts: string[] = [];
  const canonicalBrandScoped = canonicalPromotions.filter(
    (promo) => isBrandScoped(promo) && isActiveNow(promo, now),
  );
  const duplicateBrandScoped = duplicatePromotions.filter(
    (promo) => isBrandScoped(promo) && isActiveNow(promo, now),
  );

  for (const duplicate of duplicateBrandScoped) {
    for (const canonical of canonicalBrandScoped) {
      if (!overlaps(duplicate, canonical)) {
        continue;
      }
      if (!equivalentPromotion(duplicate, canonical)) {
        conflicts.push(
          `promotion-overlap: ${duplicate.code} (${duplicate.type} ${duplicate.value}) overlaps ${canonical.code} (${canonical.type} ${canonical.value}) with different terms`,
        );
      }
    }
  }
  return conflicts;
}

async function snapshotBrand(
  db: Prisma.TransactionClient,
  slug: string,
): Promise<BrandSnapshot | null> {
  const brand = await db.brand.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      nameEn: true,
      slug: true,
      description: true,
      logoKey: true,
      isFeatured: true,
      deletedAt: true,
      mergedIntoBrandId: true,
    },
  });
  if (!brand) {
    return null;
  }
  const [productsLive, productsAll, productRows, promotions] = await Promise.all([
    db.product.count({ where: { brandId: brand.id, deletedAt: null } }),
    db.product.count({ where: { brandId: brand.id } }),
    db.product.findMany({
      where: { brandId: brand.id },
      select: { slug: true },
      orderBy: { slug: 'asc' },
    }),
    db.promotion.count({ where: { brandId: brand.id } }),
  ]);
  return {
    ...brand,
    productsLive,
    productsAll,
    productSlugs: productRows.map((row) => row.slug),
    promotions,
  };
}

async function snapshotPromotions(
  db: Prisma.TransactionClient,
  brandId: string,
): Promise<PromotionSnapshot[]> {
  const rows = await db.promotion.findMany({
    where: { brandId },
    select: {
      id: true,
      code: true,
      brandId: true,
      productId: true,
      categoryId: true,
      type: true,
      value: true,
      startsAt: true,
      endsAt: true,
      isActive: true,
      minQuantity: true,
    },
    orderBy: [{ startsAt: 'asc' }, { code: 'asc' }],
  });
  return rows.map((row) => ({
    ...row,
    type: row.type,
    value: row.value.toString(),
  }));
}

async function preflightMapping(
  db: Prisma.TransactionClient,
  mapping: BrandMergeMapping,
): Promise<BrandMergeMappingReport> {
  const canonical = await snapshotBrand(db, mapping.canonicalSlug);
  const duplicate = await snapshotBrand(db, mapping.duplicateSlug);
  const conflicts: string[] = [];

  if (!canonical) {
    throw new Error(`Canonical brand "${mapping.canonicalSlug}" is missing.`);
  }
  if (!duplicate) {
    throw new Error(`Duplicate brand "${mapping.duplicateSlug}" is missing.`);
  }
  if (canonical.deletedAt !== null) {
    conflicts.push(`canonical-deleted: ${mapping.canonicalSlug}`);
  }
  if (canonical.name !== mapping.expectedCanonicalName) {
    conflicts.push(
      `canonical-name-changed: expected "${mapping.expectedCanonicalName}", found "${canonical.name}"`,
    );
  }
  if (canonical.nameEn !== mapping.expectedCanonicalNameEn) {
    conflicts.push(
      `canonical-nameEn-changed: expected ${JSON.stringify(mapping.expectedCanonicalNameEn)}, found ${JSON.stringify(canonical.nameEn)}`,
    );
  }
  if (duplicate.name !== mapping.expectedDuplicateName) {
    conflicts.push(
      `duplicate-name-changed: expected "${mapping.expectedDuplicateName}", found "${duplicate.name}"`,
    );
  }
  if (duplicate.nameEn !== mapping.expectedDuplicateNameEn) {
    conflicts.push(
      `duplicate-nameEn-changed: expected ${JSON.stringify(mapping.expectedDuplicateNameEn)}, found ${JSON.stringify(duplicate.nameEn)}`,
    );
  }
  if (duplicate.mergedIntoBrandId !== null && duplicate.mergedIntoBrandId !== canonical.id) {
    conflicts.push(
      `duplicate-merged-elsewhere: ${mapping.duplicateSlug} -> ${duplicate.mergedIntoBrandId}`,
    );
  }
  if (
    duplicate.deletedAt !== null &&
    mapping.mode === 'merge' &&
    duplicate.mergedIntoBrandId !== canonical.id
  ) {
    conflicts.push(
      `duplicate-already-deleted-without-link: ${mapping.duplicateSlug}`,
    );
  }

  const [canonicalPromotions, duplicatePromotions] = await Promise.all([
    snapshotPromotions(db, canonical.id),
    snapshotPromotions(db, duplicate.id),
  ]);
  conflicts.push(
    ...findPromotionCollisions(canonicalPromotions, duplicatePromotions),
  );

  const alreadyMerged =
    duplicate.deletedAt !== null && duplicate.mergedIntoBrandId === canonical.id;
  const linkOnly =
    duplicate.deletedAt !== null &&
    mapping.mode === 'link-already-deleted' &&
    duplicate.mergedIntoBrandId === null;

  const status: BrandMergeMappingReport['status'] =
    conflicts.length > 0
      ? 'blocked'
      : alreadyMerged && duplicate.productsAll === 0 && duplicate.promotions === 0
        ? 'already-merged'
        : linkOnly
          ? 'link'
          : 'ready';

  const aliasKeys = [
    ...brandNameKeys(canonical.name, canonical.nameEn).keys,
    ...brandNameKeys(duplicate.name, duplicate.nameEn).keys,
  ].filter((key, index, all) => all.indexOf(key) === index);

  return {
    brandLabel: mapping.brandLabel,
    mode: mapping.mode,
    status,
    canonical,
    duplicate,
    conflicts,
    expected: {
      canonicalProductsLive:
        canonical.productsLive + duplicate.productsLive,
      canonicalProductsAll: canonical.productsAll + duplicate.productsAll,
      duplicateProductsAfter: 0,
      canonicalSlugAfter: canonical.slug,
      duplicateDeleted: true,
      duplicateMergedInto: canonical.id,
    },
    operations: {
      productsReassigned: duplicate.productsAll,
      promotionsReassigned: duplicate.promotions,
      aliasKeys,
      softDelete: duplicate.deletedAt === null,
      setMergedInto: duplicate.mergedIntoBrandId !== canonical.id,
    },
  };
}

function collisionCoveredByMappings(
  collision: AliasCollision,
  mappings: BrandMergeMapping[],
): boolean {
  const slugs = new Set(collision.members.map((member) => member.slug));
  return mappings.some(
    (mapping) =>
      slugs.size === 2 &&
      slugs.has(mapping.canonicalSlug) &&
      slugs.has(mapping.duplicateSlug),
  );
}

async function preflight(
  db: Prisma.TransactionClient,
  mappings: BrandMergeMapping[],
): Promise<{
  reports: BrandMergeMappingReport[];
  aliasCollisions: AliasCollision[];
  conflicts: string[];
  brandActive: number;
  brandTotal: number;
  brandDeleted: number;
  brandedProducts: number;
  unbrandedProducts: number;
  promotions: number;
}> {
  const reports: BrandMergeMappingReport[] = [];
  for (const mapping of mappings) {
    reports.push(await preflightMapping(db, mapping));
  }

  const [brandTotal, brandActive, brandedProducts, unbrandedProducts, promotions, aliasCollisions] =
    await Promise.all([
      db.brand.count(),
      db.brand.count({ where: { deletedAt: null } }),
      db.product.count({ where: { brandId: { not: null } } }),
      db.product.count({ where: { brandId: null } }),
      db.promotion.count(),
      findBrandAliasCollisions(db, { skipMerged: true }),
    ]);

  const conflicts: string[] = [];
  for (const report of reports) {
    conflicts.push(
      ...report.conflicts.map(
        (conflict) => `${report.brandLabel}: ${conflict}`,
      ),
    );
  }
  for (const collision of aliasCollisions) {
    if (!collisionCoveredByMappings(collision, mappings)) {
      conflicts.push(
        `alias-collision: ${collision.normalizedKey} -> ${collision.members
          .map((member) => member.slug)
          .join(', ')}`,
      );
    }
  }

  return {
    reports,
    aliasCollisions,
    conflicts,
    brandActive,
    brandTotal,
    brandDeleted: brandTotal - brandActive,
    brandedProducts,
    unbrandedProducts,
    promotions,
  };
}

function countActiveMerges(reports: BrandMergeMappingReport[]): number {
  return reports.filter(
    (report) =>
      (report.status === 'ready' || report.status === 'link') &&
      report.operations.softDelete,
  ).length;
}

async function applyMapping(
  db: Prisma.TransactionClient,
  audit: AuditService,
  report: BrandMergeMappingReport,
  actorId: string,
): Promise<{ changes: number; productSlugs: string[] }> {
  const { canonical, duplicate } = report;
  let changes = 0;
  const productSlugs = [...duplicate.productSlugs];

  if (report.status === 'already-merged' && duplicate.productsAll === 0 && duplicate.promotions === 0) {
    // Repair aliases only if they are missing; this is still idempotent.
    await ensureBrandAliases(db, {
      brandId: canonical.id,
      name: canonical.name,
      nameEn: canonical.nameEn,
      createdBy: actorId,
    });
    await moveBrandAliases(db, duplicate.id, canonical.id);
    await addBrandAlias(db, {
      brandId: canonical.id,
      rawName: duplicate.name,
      kind: BrandAliasKind.LEGACY,
      createdBy: actorId,
    });
    if (duplicate.nameEn !== null) {
      await addBrandAlias(db, {
        brandId: canonical.id,
        rawName: duplicate.nameEn,
        kind: BrandAliasKind.LEGACY,
        createdBy: actorId,
      });
    }
    return { changes: 0, productSlugs: [] };
  }

  const movedProducts = await db.product.updateMany({
    where: { brandId: duplicate.id },
    data: { brandId: canonical.id },
  });
  changes += movedProducts.count;

  const movedPromotions = await db.promotion.updateMany({
    where: { brandId: duplicate.id },
    data: { brandId: canonical.id },
  });
  changes += movedPromotions.count;

  // Move existing aliases first, then register the duplicate's names as
  // legacy aliases owned by the canonical brand.
  await ensureBrandAliases(db, {
    brandId: canonical.id,
    name: canonical.name,
    nameEn: canonical.nameEn,
    createdBy: actorId,
  });
  const aliasMove = await moveBrandAliases(db, duplicate.id, canonical.id);
  changes += aliasMove.moved + aliasMove.deduplicated;
  await addBrandAlias(db, {
    brandId: canonical.id,
    rawName: duplicate.name,
    kind: BrandAliasKind.LEGACY,
    createdBy: actorId,
  });
  if (duplicate.nameEn !== null) {
    await addBrandAlias(db, {
      brandId: canonical.id,
      rawName: duplicate.nameEn,
      kind: BrandAliasKind.LEGACY,
      createdBy: actorId,
    });
  }

  // Conservative non-identity field merge: never downgrade canonical values.
  const fieldPatch: Prisma.BrandUpdateManyMutationInput = {};
  if (!canonical.isFeatured && duplicate.isFeatured) {
    fieldPatch.isFeatured = true;
  }
  if (canonical.description === null && duplicate.description !== null) {
    fieldPatch.description = duplicate.description;
  }
  if (canonical.logoKey === null && duplicate.logoKey !== null) {
    fieldPatch.logoKey = duplicate.logoKey;
  }
  if (Object.keys(fieldPatch).length > 0) {
    await db.brand.updateMany({
      where: { id: canonical.id, deletedAt: null },
      data: { ...fieldPatch, updatedBy: actorId },
    });
    changes += 1;
  }

  // Verify dependents are gone BEFORE soft-deleting the duplicate.
  const [remainingProducts, remainingPromotions] = await Promise.all([
    db.product.count({ where: { brandId: duplicate.id } }),
    db.promotion.count({ where: { brandId: duplicate.id } }),
  ]);
  if (remainingProducts > 0 || remainingPromotions > 0) {
    throw new Error(
      `Refusing to soft-delete ${duplicate.slug}: ${remainingProducts} products / ${remainingPromotions} promotions still reference it.`,
    );
  }

  const deletedAt = duplicate.deletedAt ?? new Date();
  const updated = await db.brand.updateMany({
    where: { id: duplicate.id },
    data: {
      deletedAt,
      mergedIntoBrandId: canonical.id,
      updatedBy: actorId,
    },
  });
  changes += updated.count;

  await audit.log(
    {
      userId: actorId,
      action:
        report.mode === 'link-already-deleted'
          ? 'BRAND_MERGE_LINKED'
          : 'BRAND_MERGED',
      entity: 'Brand',
      entityId: duplicate.id,
      before: {
        slug: duplicate.slug,
        name: duplicate.name,
        nameEn: duplicate.nameEn,
        deletedAt: duplicate.deletedAt?.toISOString() ?? null,
        mergedIntoBrandId: duplicate.mergedIntoBrandId,
        products: duplicate.productsAll,
        promotions: duplicate.promotions,
      },
      after: {
        canonicalId: canonical.id,
        canonicalSlug: canonical.slug,
        canonicalSlugUnchanged: canonical.slug === report.expected.canonicalSlugAfter,
        productsReassigned: movedProducts.count,
        promotionsReassigned: movedPromotions.count,
        aliasKeys: report.operations.aliasKeys,
        deletedAt: deletedAt.toISOString(),
        mergedIntoBrandId: canonical.id,
      },
    },
    db,
  );

  return { changes, productSlugs };
}

export async function runBrandMerge(
  prisma: PrismaService,
  options: BrandMergeOptions,
): Promise<BrandMergeReport> {
  const mappings = selectedMappings(options);
  const actorId = options.actorId ?? MERGE_ACTOR;
  const audit = new AuditService(prisma);

  if (!options.apply) {
    const pre = await prisma.$transaction(
      (tx) => preflight(tx, mappings),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const activeAfter =
      pre.brandActive - countActiveMerges(pre.reports);
    return {
      mode: 'dry-run',
      generatedAt: new Date().toISOString(),
      mappings: pre.reports,
      aliasCollisions: pre.aliasCollisions,
      preflight: {
        brandTotal: pre.brandTotal,
        brandActive: pre.brandActive,
        brandDeleted: pre.brandDeleted,
        brandedProducts: pre.brandedProducts,
        unbrandedProducts: pre.unbrandedProducts,
        promotions: pre.promotions,
      },
      totals: {
        brandActiveAfter: activeAfter,
        brandTotalAfter: pre.brandTotal,
        changes: 0,
      },
      status: pre.conflicts.length > 0 ? 'blocked' : 'ready',
    };
  }

  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(258258)`;
      const brandIds = mappings
        .flatMap((mapping) => [mapping.canonicalSlug, mapping.duplicateSlug])
        .map((slug) => slug);
      const rows = await tx.brand.findMany({
        where: { slug: { in: brandIds } },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      if (rows.length > 0) {
        await tx.$queryRaw`
          SELECT id FROM "Brand"
          WHERE id IN (${Prisma.join(rows.map((row) => row.id))})
          ORDER BY id
          FOR UPDATE
        `;
      }

      const pre = await preflight(tx, mappings);
      if (pre.conflicts.length > 0) {
        throw new BrandMergeBlockedError(pre.conflicts);
      }

      let changes = 0;
      const productSlugs = new Set<string>();
      for (const report of pre.reports) {
        const applied = await applyMapping(tx, audit, report, actorId);
        changes += applied.changes;
        for (const slug of applied.productSlugs) {
          productSlugs.add(slug);
        }
      }

      const synced = await syncAllBrandAliases(tx, actorId);
      if (synced.brands + synced.skippedMerged === 0) {
        // Unreachable for a non-empty catalog; keeps the result meaningful.
        changes += 0;
      }

      const remainingCollisions = await findBrandAliasCollisions(tx, {
        skipMerged: true,
      });
      if (remainingCollisions.length > 0) {
        throw new BrandMergeBlockedError(
          remainingCollisions.map(
            (collision) =>
              `alias-collision-after-merge: ${collision.normalizedKey} -> ${collision.members
                .map((member) => member.slug)
                .join(', ')}`,
          ),
        );
      }

      const brandActive = await tx.brand.count({ where: { deletedAt: null } });
      const brandTotal = await tx.brand.count();

      return {
        changes,
        productSlugs: [...productSlugs],
        brandActive,
        brandTotal,
        aliasCollisions: remainingCollisions,
        reports: pre.reports,
        preflight: {
          brandTotal: pre.brandTotal,
          brandActive: pre.brandActive,
          brandDeleted: pre.brandDeleted,
          brandedProducts: pre.brandedProducts,
          unbrandedProducts: pre.unbrandedProducts,
          promotions: pre.promotions,
        },
      };
    },
    {
      timeout: 120_000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  if (options.invalidateCache && result.productSlugs.length > 0) {
    const tags = [
      'catalog:brands',
      'catalog:products',
      ...result.productSlugs.map((slug) => `catalog:product:${slug}`),
    ];
    await options.invalidateCache(tags);
  }

  return {
    mode: 'apply',
    generatedAt: new Date().toISOString(),
    mappings: result.reports,
    aliasCollisions: result.aliasCollisions,
    preflight: result.preflight,
    totals: {
      brandActiveAfter: result.brandActive,
      brandTotalAfter: result.brandTotal,
      changes: result.changes,
    },
    status: 'applied',
  };
}
