import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { CategoriesService } from '../src/modules/products/categories.service';

jest.setTimeout(30_000);

describe('Admin category API database integration (SS-103)', () => {
  let prisma: PrismaService;
  let service: CategoriesService;

  const createdCategoryIds: string[] = [];
  const createdAuditIds: string[] = [];
  const actorId = '11111111-1111-4111-8111-111111111111';

  async function createCategoryDirect(overrides: Record<string, unknown> = {}) {
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}-${Math.random()}`,
        slug: `cat-${Date.now()}-${Math.random()}`,
        ...overrides,
      },
    });
    createdCategoryIds.push(category.id);
    return category;
  }

  async function trackAudits(entityId: string): Promise<void> {
    const rows = await prisma.auditLog.findMany({ where: { entityId } });
    createdAuditIds.push(...rows.map((row) => row.id));
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    service = new CategoriesService(prisma, audit);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.$disconnect();
  });

  it('creates a category with a generated slug and audits CATEGORY_CREATED', async () => {
    const name = `Laptops ${Date.now()}`;
    const result = await service.create({ name }, actorId);
    await trackAudits(result.id);

    expect(result.slug).toBe(name.toLowerCase().replace(/\s+/g, '-'));
    expect(result.parentId).toBeNull();
    expect(result.children).toEqual([]);

    const audits = await prisma.auditLog.findMany({
      where: { entityId: result.id, action: 'CATEGORY_CREATED' },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]!.after)).not.toContain('createdBy');
    expect(JSON.stringify(audits[0]!.after)).not.toContain('updatedBy');
  });

  it('creates nested categories and returns children in detail', async () => {
    const root = await service.create({ name: `Root ${Date.now()}`, sortOrder: 1 }, actorId);
    const child = await service.create(
      { name: `Child ${Date.now()}`, parentId: root.id, sortOrder: 2 },
      actorId,
    );
    await trackAudits(root.id);
    await trackAudits(child.id);

    const detail = await service.getDetail(root.id);
    expect(detail.children).toHaveLength(1);
    expect(detail.children[0]!.id).toBe(child.id);
    expect(detail).not.toHaveProperty('deletedAt');
  });

  it('returns 404 when creating under a soft-deleted parent', async () => {
    const parent = await createCategoryDirect();
    await prisma.category.update({
      where: { id: parent.id },
      data: { deletedAt: new Date() },
    });
    await expect(
      service.create({ name: 'x', parentId: parent.id }, actorId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns 409 on a duplicate slug', async () => {
    const sharedSlug = `dup-cat-${Date.now()}`;
    const first = await service.create({ name: 'A', slug: sharedSlug }, actorId);
    await trackAudits(first.id);

    await expect(
      service.create({ name: 'B', slug: sharedSlug }, actorId),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects self-parenting with 409', async () => {
    const category = await service.create({ name: `Self ${Date.now()}` }, actorId);
    await trackAudits(category.id);
    await expect(
      service.update(category.id, { parentId: category.id }, actorId),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a descendant cycle with 409', async () => {
    const a = await service.create({ name: `A ${Date.now()}` }, actorId);
    const b = await service.create({ name: `B ${Date.now()}`, parentId: a.id }, actorId);
    await trackAudits(a.id);
    await trackAudits(b.id);

    await expect(
      service.update(a.id, { parentId: b.id }, actorId),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('moves a category to root via parentId null and audits the change', async () => {
    const root = await service.create({ name: `Root ${Date.now()}` }, actorId);
    const child = await service.create({ name: `Child ${Date.now()}`, parentId: root.id }, actorId);
    await trackAudits(root.id);

    const updated = await service.update(child.id, { parentId: null }, actorId);
    await trackAudits(child.id);
    expect(updated.parentId).toBeNull();

    const audits = await prisma.auditLog.findMany({
      where: { entityId: child.id, action: 'CATEGORY_UPDATED' },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]!.before)).toContain(root.id);
    expect(JSON.stringify(audits[0]!.after)).toContain('null');
  });

  it('updates name/sortOrder/isVisible and reflects visibility changes in the audit payload', async () => {
    const category = await service.create({ name: `Vis ${Date.now()}`, isVisible: true }, actorId);
    await trackAudits(category.id);

    const updated = await service.update(
      category.id,
      { isVisible: false, sortOrder: 7 },
      actorId,
    );
    await trackAudits(category.id);
    expect(updated.isVisible).toBe(false);
    expect(updated.sortOrder).toBe(7);

    const audits = await prisma.auditLog.findMany({
      where: { entityId: category.id, action: 'CATEGORY_UPDATED' },
    });
    expect(JSON.stringify(audits[0]!.before)).toContain('"isVisible":true');
    expect(JSON.stringify(audits[0]!.after)).toContain('"isVisible":false');
  });

  it('soft-deletes a category and excludes it from detail and list', async () => {
    const category = await service.create({ name: `Del ${Date.now()}` }, actorId);
    await trackAudits(category.id);

    await service.softDelete(category.id, actorId);
    const row = await prisma.category.findUnique({ where: { id: category.id } });
    expect(row?.deletedAt).not.toBeNull();

    await expect(service.getDetail(category.id)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects deletion when active children exist with 409', async () => {
    const parent = await service.create({ name: `Parent ${Date.now()}` }, actorId);
    const child = await service.create({ name: `Child ${Date.now()}`, parentId: parent.id }, actorId);
    await trackAudits(parent.id);
    await trackAudits(child.id);

    await expect(service.softDelete(parent.id, actorId)).rejects.toMatchObject({ status: 409 });
  });

  it('rejects deletion when an active product references the category with 409', async () => {
    const category = await service.create({ name: `Used ${Date.now()}` }, actorId);
    await trackAudits(category.id);

    const brand = await prisma.brand.create({
      data: { name: `برند ${Date.now()}-${Math.random()}`, slug: `b-${Date.now()}-${Math.random()}` },
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
      await expect(service.softDelete(category.id, actorId)).rejects.toMatchObject({ status: 409 });
    } finally {
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.brand.delete({ where: { id: brand.id } });
    }
  });

  it('rolls back the audit when the deletion transaction fails', async () => {
    const category = await service.create({ name: `Rb ${Date.now()}` }, actorId);
    await trackAudits(category.id);

    // Force a failure: give it an active child so deletion throws after create.
    const child = await service.create({ name: `Child ${Date.now()}`, parentId: category.id }, actorId);
    await trackAudits(child.id);

    await expect(service.softDelete(category.id, actorId)).rejects.toMatchObject({ status: 409 });

    const audits = await prisma.auditLog.findMany({
      where: { entityId: category.id, action: 'CATEGORY_DELETED' },
    });
    expect(audits).toHaveLength(0);
  });

  it('supports pagination with deterministic ordering', async () => {
    const page1 = await service.list({ page: 1, limit: 10 });
    expect(Array.isArray(page1.items)).toBe(true);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(10);
    expect(page1.total).toBeGreaterThanOrEqual(0);
    expect(page1.items[0]).not.toHaveProperty('deletedAt');
  });
});
