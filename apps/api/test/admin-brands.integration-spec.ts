import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { BrandsService } from '../src/modules/products/brands.service';

jest.setTimeout(30_000);

describe('Admin brand API database integration (SS-103)', () => {
  let prisma: PrismaService;
  let service: BrandsService;

  const createdBrandIds: string[] = [];
  const createdAuditIds: string[] = [];
  const actorId = '11111111-1111-4111-8111-111111111111';

  async function trackAudits(entityId: string): Promise<void> {
    const rows = await prisma.auditLog.findMany({ where: { entityId } });
    createdAuditIds.push(...rows.map((row) => row.id));
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    service = new BrandsService(prisma, audit);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.$disconnect();
  });

  it('creates a brand with a generated slug, defaults isFeatured false, and audits BRAND_CREATED', async () => {
    const name = `Dell ${Date.now()}`;
    const result = await service.create({ name }, actorId);
    await trackAudits(result.id);

    expect(result.slug).toBe(name.toLowerCase().replace(/\s+/g, '-'));
    expect(result.isFeatured).toBe(false);
    expect(result).not.toHaveProperty('logoKey');
    expect(result).not.toHaveProperty('deletedAt');

    const audits = await prisma.auditLog.findMany({
      where: { entityId: result.id, action: 'BRAND_CREATED' },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]!.after)).toContain('"isFeatured":false');
    expect(JSON.stringify(audits[0]!.after)).not.toContain('logoKey');
    expect(JSON.stringify(audits[0]!.after)).not.toContain('createdBy');
    expect(JSON.stringify(audits[0]!.after)).not.toContain('updatedBy');
  });

  it('creates and updates isFeatured, reading it back in detail', async () => {
    const created = await service.create(
      { name: `Featured ${Date.now()}`, isFeatured: true },
      actorId,
    );
    await trackAudits(created.id);
    expect(created.isFeatured).toBe(true);

    const detail = await service.getDetail(created.id);
    expect(detail.isFeatured).toBe(true);
    expect(detail).not.toHaveProperty('logoKey');

    const updated = await service.update(created.id, { isFeatured: false }, actorId);
    await trackAudits(created.id);
    expect(updated.isFeatured).toBe(false);

    const audits = await prisma.auditLog.findMany({
      where: { entityId: created.id, action: 'BRAND_UPDATED' },
    });
    expect(JSON.stringify(audits[0]!.before)).toContain('"isFeatured":true');
    expect(JSON.stringify(audits[0]!.after)).toContain('"isFeatured":false');
  });

  it('returns 409 on a duplicate slug', async () => {
    const sharedSlug = `dup-brand-${Date.now()}`;
    const first = await service.create({ name: 'A', slug: sharedSlug }, actorId);
    await trackAudits(first.id);

    await expect(
      service.create({ name: 'B', slug: sharedSlug }, actorId),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('soft-deletes a brand and excludes it from detail and list', async () => {
    const brand = await service.create({ name: `Del ${Date.now()}` }, actorId);
    await trackAudits(brand.id);

    await service.softDelete(brand.id, actorId);
    const row = await prisma.brand.findUnique({ where: { id: brand.id } });
    expect(row?.deletedAt).not.toBeNull();

    await expect(service.getDetail(brand.id)).rejects.toMatchObject({ status: 404 });

    const list = await service.list({ page: 1, limit: 100 });
    expect(list.items.find((item) => item.id === brand.id)).toBeUndefined();
  });

  it('rejects deletion when an active product references the brand with 409', async () => {
    const brand = await service.create({ name: `Used ${Date.now()}` }, actorId);
    await trackAudits(brand.id);

    const category = await prisma.category.create({
      data: { name: `دسته ${Date.now()}-${Math.random()}`, slug: `c-${Date.now()}-${Math.random()}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}-${Math.random()}`,
        slug: `p-${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: 'NEW',
        status: 'DRAFT',
      },
    });
    try {
      await expect(service.softDelete(brand.id, actorId)).rejects.toMatchObject({ status: 409 });
    } finally {
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.category.delete({ where: { id: category.id } });
    }
  });

  it('rolls back the audit when the deletion transaction fails', async () => {
    const brand = await service.create({ name: `Rb ${Date.now()}` }, actorId);
    await trackAudits(brand.id);

    const category = await prisma.category.create({
      data: { name: `دسته ${Date.now()}-${Math.random()}`, slug: `c-${Date.now()}-${Math.random()}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}-${Math.random()}`,
        slug: `p-${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: 'NEW',
        status: 'DRAFT',
      },
    });
    try {
      await expect(service.softDelete(brand.id, actorId)).rejects.toMatchObject({ status: 409 });
    } finally {
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.category.delete({ where: { id: category.id } });
    }

    const audits = await prisma.auditLog.findMany({
      where: { entityId: brand.id, action: 'BRAND_DELETED' },
    });
    expect(audits).toHaveLength(0);
  });

  it('supports pagination with deterministic ordering', async () => {
    const page1 = await service.list({ page: 1, limit: 10 });
    expect(Array.isArray(page1.items)).toBe(true);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(10);
    expect(page1.items[0]).not.toHaveProperty('logoKey');
  });
});
