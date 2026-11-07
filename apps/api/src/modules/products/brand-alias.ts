import { BrandAliasKind, Prisma } from '@prisma/client';
import { brandNameKeys, normalizeBrandName } from './brand-normalize';

/**
 * Shared brand alias persistence and ownership rules (SS-258).
 *
 * `BrandAlias.normalizedKey` is the database uniqueness authority. Every
 * create/update/import path writes aliases in the same transaction as the
 * Brand row. The helper uses `createMany({ skipDuplicates: true })` and then
 * re-reads the owners, so a concurrent insert cannot abort an unrelated
 * transaction with a raw P2002; the losing transaction throws a typed
 * conflict and rolls itself back.
 */

export class BrandAliasConflictError extends Error {
  constructor(
    readonly normalizedKey: string,
    readonly ownerBrandId: string,
  ) {
    super(`Brand name key "${normalizedKey}" is already owned by brand ${ownerBrandId}.`);
    this.name = 'BrandAliasConflictError';
  }
}

type BrandDb = Prisma.TransactionClient;

/**
 * Serialize alias writers for the same normalized key inside the current
 * transaction. `hashtext` collisions only over-serialize; correctness still
 * comes from the unique index and the post-write owner read.
 */
export async function lockBrandAliasKeys(
  db: BrandDb,
  keys: string[],
): Promise<void> {
  const sorted = [...new Set(keys)].sort();
  for (const key of sorted) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}

export interface BrandAliasInput {
  brandId: string;
  name: string;
  nameEn?: string | null;
  createdBy?: string | null;
}

/**
 * Return the brand that owns a normalized key, if any.
 *
 * Alias lookup is the primary path. The fallback scan protects brands created
 * outside the service (direct SQL/tests) and installations that have not yet
 * run the alias backfill. The alias unique constraint still provides race
 * safety for concurrent requests because every application create inserts an
 * alias in the same transaction.
 */
export async function findBrandNameOwner(
  db: BrandDb,
  normalizedKey: string,
  excludeBrandId?: string,
): Promise<string | null> {
  const alias = await db.brandAlias.findUnique({
    where: { normalizedKey },
    select: { brandId: true },
  });
  if (alias) {
    return alias.brandId === excludeBrandId ? null : alias.brandId;
  }

  const candidates = (await db.brand.findMany({
    select: { id: true, name: true, nameEn: true },
  })) ?? [];

  for (const brand of candidates) {
    if (brand.id === excludeBrandId) {
      continue;
    }
    if (brandNameKeys(brand.name, brand.nameEn).keys.includes(normalizedKey)) {
      return brand.id;
    }
  }
  return null;
}

/** Insert any missing aliases for one brand and verify ownership. */
export async function ensureBrandAliases(
  db: BrandDb,
  input: BrandAliasInput,
): Promise<void> {
  const { nameKey, nameEnKey, keys } = brandNameKeys(input.name, input.nameEn);
  if (nameKey === null) {
    throw new Error('Brand name normalizes to an empty key.');
  }

  const data = keys.map((normalizedKey) => ({
    brandId: input.brandId,
    rawName:
      normalizedKey === nameKey
        ? input.name
        : (input.nameEn ?? input.name),
    normalizedKey,
    kind:
      normalizedKey === nameKey
        ? BrandAliasKind.NAME
        : BrandAliasKind.NAME_EN,
    createdBy: input.createdBy ?? null,
  }));

  await lockBrandAliasKeys(db, keys);
  if (data.length > 0) {
    await db.brandAlias.createMany({ data, skipDuplicates: true });
  }

  const owners = await db.brandAlias.findMany({
    where: { normalizedKey: { in: keys } },
    select: { normalizedKey: true, brandId: true },
  });
  for (const owner of owners) {
    if (owner.brandId !== input.brandId) {
      throw new BrandAliasConflictError(owner.normalizedKey, owner.brandId);
    }
  }

  // A concurrent transaction may have inserted one of our keys between
  // createMany and the read above; the read is the post-write authority.
  if (nameEnKey !== null && !keys.includes(nameEnKey)) {
    // Defensive: brandNameKeys already dedupes, so this cannot happen.
    throw new Error('Internal brand alias key mismatch.');
  }
}

/** Add one extra alias (legacy/former name) owned by `brandId`. */
export async function addBrandAlias(
  db: BrandDb,
  input: {
    brandId: string;
    rawName: string;
    kind?: BrandAliasKind;
    createdBy?: string | null;
  },
): Promise<boolean> {
  const normalizedKey = normalizeBrandName(input.rawName);
  if (normalizedKey === null) {
    return false;
  }

  await lockBrandAliasKeys(db, [normalizedKey]);
  await db.brandAlias.createMany({
    data: [
      {
        brandId: input.brandId,
        rawName: input.rawName,
        normalizedKey,
        kind: input.kind ?? BrandAliasKind.LEGACY,
        createdBy: input.createdBy ?? null,
      },
    ],
    skipDuplicates: true,
  });

  const owner = await db.brandAlias.findUnique({
    where: { normalizedKey },
    select: { brandId: true },
  });
  if (!owner) {
    throw new Error(`Alias insert for "${normalizedKey}" did not persist.`);
  }
  if (owner.brandId !== input.brandId) {
    throw new BrandAliasConflictError(normalizedKey, owner.brandId);
  }
  return true;
}

/**
 * Move every alias owned by a duplicate to its canonical brand.
 * Returns the number of rows moved, deduplicated or already canonical.
 */
export async function moveBrandAliases(
  db: BrandDb,
  fromBrandId: string,
  toBrandId: string,
): Promise<{ moved: number; deduplicated: number }> {
  const rows = await db.brandAlias.findMany({
    where: { brandId: fromBrandId },
    select: { id: true, normalizedKey: true },
  });

  let moved = 0;
  for (const row of rows) {
    // `normalizedKey` is globally unique, so the row itself is the only
    // possible owner. Repointing it cannot violate the unique index.
    await db.brandAlias.update({
      where: { id: row.id },
      data: { brandId: toBrandId },
    });
    moved += 1;
  }
  return { moved, deduplicated: 0 };
}

export interface AliasCollisionMember {
  brandId: string;
  slug: string;
  name: string;
  source: 'name' | 'nameEn';
  deletedAt: Date | null;
  mergedIntoBrandId: string | null;
}

export interface AliasCollision {
  normalizedKey: string;
  members: AliasCollisionMember[];
}

/**
 * Read-only preflight: every normalized key that would belong to more than
 * one Brand row. Before a merge this is expected to report the curated pairs;
 * after a merge it must report zero.
 */
export async function findBrandAliasCollisions(
  db: BrandDb,
  options: { skipMerged?: boolean } = {},
): Promise<AliasCollision[]> {
  const brands = (await db.brand.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      nameEn: true,
      deletedAt: true,
      mergedIntoBrandId: true,
    },
  })).filter(
    (brand) => !(options.skipMerged && brand.mergedIntoBrandId !== null),
  );

  const groups = new Map<string, AliasCollisionMember[]>();
  for (const brand of brands) {
    const { nameKey, nameEnKey } = brandNameKeys(brand.name, brand.nameEn);
    const entries: Array<[string | null, 'name' | 'nameEn']> = [
      [nameKey, 'name'],
      [nameEnKey, 'nameEn'],
    ];
    for (const [key, source] of entries) {
      if (key === null) {
        continue;
      }
      const members = groups.get(key) ?? [];
      members.push({
        brandId: brand.id,
        slug: brand.slug,
        name: brand.name,
        source,
        deletedAt: brand.deletedAt,
        mergedIntoBrandId: brand.mergedIntoBrandId,
      });
      groups.set(key, members);
    }
  }

  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([normalizedKey, members]) => ({ normalizedKey, members }))
    .sort((a, b) => a.normalizedKey.localeCompare(b.normalizedKey));
}

/**
 * Backfill aliases for every brand that is not a merged duplicate.
 * Merged duplicates deliberately do not own their names; the canonical brand
 * owns them after the merge, so skipping them avoids recreating a collision.
 */
export async function syncAllBrandAliases(
  db: BrandDb,
  createdBy?: string | null,
): Promise<{ brands: number; skippedMerged: number }> {
  const brands = await db.brand.findMany({
    select: {
      id: true,
      name: true,
      nameEn: true,
      mergedIntoBrandId: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  let synced = 0;
  let skippedMerged = 0;
  for (const brand of brands) {
    if (brand.mergedIntoBrandId !== null) {
      skippedMerged += 1;
      continue;
    }
    await ensureBrandAliases(db, {
      brandId: brand.id,
      name: brand.name,
      nameEn: brand.nameEn,
      createdBy: createdBy ?? null,
    });
    synced += 1;
  }
  return { brands: synced, skippedMerged };
}
