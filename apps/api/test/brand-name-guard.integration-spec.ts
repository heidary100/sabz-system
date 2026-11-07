import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/common/database/prisma.service';
import { StorefrontCacheService } from '../src/common/storefront-cache/storefront-cache.service';
import { AuditService } from '../src/modules/audit/audit.service';
import {
  addBrandAlias,
  moveBrandAliases,
} from '../src/modules/products/brand-alias';
import { normalizeBrandName } from '../src/modules/products/brand-normalize';
import { BrandsService } from '../src/modules/products/brands.service';

jest.setTimeout(60_000);

describe('Brand normalized-name guard (SS-258)', () => {
  let prisma: PrismaService;
  let service: BrandsService;
  const actorId = '22222222-2222-4222-8222-222222222222';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdBrandIds: string[] = [];

  function name(value: string): string {
    return `SS258 ${value} ${suffix}`;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new BrandsService(
      prisma,
      new AuditService(prisma),
      new StorefrontCacheService(new ConfigService()),
    );
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: createdBrandIds } },
    });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.$disconnect();
  });

  async function create(nameValue: string, nameEn?: string) {
    const brand = await service.create(
      { name: nameValue, ...(nameEn !== undefined ? { nameEn } : {}) },
      actorId,
    );
    createdBrandIds.push(brand.id);
    return brand;
  }

  it('rejects a create that differs only by Persian/Arabic folding or whitespace', async () => {
    const canonical = await create(name('Green'));
    const variant = name('Green')
      .replace('Green', 'Green')
      .replace(/\s+/g, '   ')
      .replace(/ی/g, 'ي');

    await expect(service.create({ name: variant }, actorId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(canonical.id).toBeDefined();
  });

  it('rejects a create that matches an existing English nameEn alias', async () => {
    await create(name('English'), `English-${suffix}`);
    await expect(
      service.create({ name: `english-${suffix}`.toUpperCase() }, actorId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows an update to the brand’s own normalized name', async () => {
    const brand = await create(name('OwnName'));
    const updated = await service.update(
      brand.id,
      { name: `${name('OwnName')}`.replace(/\s+/g, '  ') },
      actorId,
    );
    expect(updated.id).toBe(brand.id);
  });

  it('rejects an update to another brand’s normalized name', async () => {
    const first = await create(name('First'));
    const second = await create(name('Second'));
    await expect(
      service.update(second.id, { name: first.name }, actorId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps a merged/soft-deleted duplicate name protected', async () => {
    const canonical = await create(name('Canonical'));
    const duplicate = await create(name('Duplicate'));

    await prisma.$transaction(async (tx) => {
      await moveBrandAliases(tx, duplicate.id, canonical.id);
      await addBrandAlias(tx, {
        brandId: canonical.id,
        rawName: duplicate.name,
      });
      await tx.brand.update({
        where: { id: duplicate.id },
        data: {
          deletedAt: new Date(),
          mergedIntoBrandId: canonical.id,
        },
      });
    });

    await expect(
      service.create({ name: duplicate.name.toUpperCase() }, actorId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('serializes concurrent creates: one row, one 409', async () => {
    const raceName = name('Race');
    const results = await Promise.allSettled([
      service.create({ name: raceName }, actorId),
      service.create({ name: raceName }, actorId),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof service.create>>> =>
        result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(ConflictException);
    createdBrandIds.push(fulfilled[0]!.value.id);

    const key = normalizeBrandName(raceName)!;
    const aliases = await prisma.brandAlias.findMany({
      where: { normalizedKey: key },
    });
    expect(aliases).toHaveLength(1);
    const winners = await prisma.brand.findMany({
      where: { id: { in: createdBrandIds } },
      select: { name: true },
    });
    expect(winners.filter((row) => row.name === raceName)).toHaveLength(1);
  });
});
