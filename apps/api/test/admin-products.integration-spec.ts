import { ProductCondition, ProductStatus } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { ProductsService } from '../src/modules/products/products.service';

jest.setTimeout(30_000);

describe('Admin product API database integration (SS-102)', () => {
  let prisma: PrismaService;
  let service: ProductsService;

  const createdProductIds: string[] = [];
  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdMediaIds: string[] = [];
  const createdAuditIds: string[] = [];
  const actorId = '11111111-1111-4111-8111-111111111111';

  async function createBrand(): Promise<{ id: string; slug: string }> {
    const brand = await prisma.brand.create({
      data: { name: `برند ${Date.now()}-${Math.random()}`, slug: `brand-${Date.now()}-${Math.random()}` },
    });
    createdBrandIds.push(brand.id);
    return { id: brand.id, slug: brand.slug };
  }

  async function createCategory(): Promise<{ id: string; slug: string }> {
    const category = await prisma.category.create({
      data: { name: `دسته ${Date.now()}-${Math.random()}`, slug: `cat-${Date.now()}-${Math.random()}` },
    });
    createdCategoryIds.push(category.id);
    return { id: category.id, slug: category.slug };
  }

  async function createProduct(
    overrides: { status?: ProductStatus; deletedAt?: Date | null } = {},
  ): Promise<{ id: string; slug: string }> {
    const brand = await createBrand();
    const category = await createCategory();
    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}-${Math.random()}`,
        slug: `prod-${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        status: overrides.status ?? ProductStatus.DRAFT,
        deletedAt: overrides.deletedAt ?? null,
        createdBy: actorId,
      },
    });
    createdProductIds.push(product.id);
    return { id: product.id, slug: product.slug };
  }

  async function addVariant(productId: string): Promise<void> {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `SKU-${Date.now()}-${Math.random()}`,
        price: '100.00',
        stockQuantity: 1,
        createdBy: actorId,
      },
    });
    createdVariantIds.push(variant.id);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    service = new ProductsService(prisma, audit);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: createdProductIds } },
    });
    await prisma.productMedia.deleteMany({ where: { id: { in: createdMediaIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
    // Defensive: delete any products still referencing the brands/categories we
    // created (a test may have created a product without recording its id, or a
    // helper created one that was not tracked).
    const orphanProducts = await prisma.product.findMany({
      where: {
        OR: [
          { brandId: { in: createdBrandIds } },
          { categoryId: { in: createdCategoryIds } },
        ],
      },
      select: { id: true },
    });
    const orphanIds = orphanProducts.map((row) => row.id);
    await prisma.productVariant.deleteMany({
      where: { productId: { in: orphanIds } },
    });
    await prisma.productMedia.deleteMany({
      where: { productId: { in: orphanIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: orphanIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.$disconnect();
  });

  it('creates a product as DRAFT with a generated slug and audits PRODUCT_CREATED', async () => {
    const brand = await createBrand();
    const category = await createCategory();
    const name = `Dell XPS ${Date.now()}`;
    const expectedSlug = `dell-xps-${Date.now()}`;

    const result = await service.create(
      {
        name,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
      },
      actorId,
    );

    createdAuditIds.push(
      ...(await prisma.auditLog
        .findMany({ where: { entityId: result.id, action: 'PRODUCT_CREATED' } })
        .then((rows) => rows.map((row) => row.id))),
    );

    expect(result.status).toBe(ProductStatus.DRAFT);
    expect(result.slug).toBe(expectedSlug);

    const audits = await prisma.auditLog.findMany({
      where: { entityId: result.id, action: 'PRODUCT_CREATED' },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]!.after)).not.toContain('storageKey');
  });

  it('returns 404 when creating with a soft-deleted brand', async () => {
    const brand = await createBrand();
    await prisma.brand.update({
      where: { id: brand.id },
      data: { deletedAt: new Date() },
    });
    const category = await createCategory();

    await expect(
      service.create(
        {
          name: 'x',
          brandId: brand.id,
          categoryId: category.id,
          condition: ProductCondition.NEW,
        },
        actorId,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns 409 on a duplicate slug', async () => {
    const brand = await createBrand();
    const category = await createCategory();
    const sharedSlug = `unique-slug-${Date.now()}`;
    const first = await service.create(
      {
        name: 'محصول یکتا',
        slug: sharedSlug,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
      },
      actorId,
    );
    createdProductIds.push(first.id);
    createdAuditIds.push(
      ...(await prisma.auditLog
        .findMany({ where: { entityId: first.id } })
        .then((rows) => rows.map((row) => row.id))),
    );

    await expect(
      service.create(
        {
          name: 'دیگری',
          slug: sharedSlug,
          brandId: brand.id,
          categoryId: category.id,
          condition: ProductCondition.NEW,
        },
        actorId,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('publishes a DRAFT product with a variant and archives it, then deletes only when archived', async () => {
    const { id } = await createProduct();
    await addVariant(id);

    const published = await service.publish(id, actorId);
    expect(published.status).toBe(ProductStatus.PUBLISHED);

    // Cannot delete a non-archived product.
    await expect(service.softDelete(id, actorId)).rejects.toMatchObject({
      status: 409,
    });

    const archived = await service.archive(id, actorId);
    expect(archived.status).toBe(ProductStatus.ARCHIVED);

    const deleted = await service.softDelete(id, actorId);
    expect(deleted.id).toBe(id);

    const row = await prisma.product.findUnique({ where: { id } });
    expect(row?.deletedAt).not.toBeNull();

    // Soft-deleted product is excluded from detail and list.
    await expect(service.getDetail(id)).rejects.toMatchObject({ status: 404 });

    const audits = await prisma.auditLog.findMany({
      where: { entityId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'PRODUCT_PUBLISHED',
        'PRODUCT_ARCHIVED',
        'PRODUCT_DELETED',
      ]),
    );
    createdAuditIds.push(...audits.map((a) => a.id));
  });

  it('rejects publishing a product with no variant (409)', async () => {
    const { id } = await createProduct();
    await expect(service.publish(id, actorId)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('excludes soft-deleted products from list and search', async () => {
    const brand = await createBrand();
    const category = await createCategory();
    const active = await prisma.product.create({
      data: {
        name: 'محصول فعال',
        slug: `active-${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        createdBy: actorId,
      },
    });
    createdProductIds.push(active.id);
    const deleted = await prisma.product.create({
      data: {
        name: 'محصول حذفشده',
        slug: `deleted-${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        deletedAt: new Date(),
        createdBy: actorId,
      },
    });
    createdProductIds.push(deleted.id);

    const result = await service.list({});
    const ids = result.items.map((item) => item.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(deleted.id);
  });

  it('returns a detail with variants and Decimal serialized as strings, without internal fields', async () => {
    const brand = await createBrand();
    const category = await createCategory();
    const product = await prisma.product.create({
      data: {
        name: 'محصول با وزن',
        slug: `weight-${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        weightKg: '1.500',
        createdBy: actorId,
      },
    });
    createdProductIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `WEIGHT-${Date.now()}-${Math.random()}`,
        price: '2500.00',
        stockQuantity: 3,
        createdBy: actorId,
      },
    });
    createdVariantIds.push(variant.id);

    const detail = await service.getDetail(product.id);
    // Decimal.toString() strips trailing zeros, consistent with the rest of
    // the API (e.g. partner tier discountPercent).
    expect(detail.weightKg).toBe('1.5');
    expect(detail.variants[0]!.price).toBe('2500');
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('logoKey');
    expect(serialized).not.toContain('deletedAt');
    expect(serialized).not.toContain('createdBy');
    expect(serialized).not.toContain('updatedBy');
  });

  it('clears originCountry when updated to null', async () => {
    const brand = await createBrand();
    const category = await createCategory();
    const product = await prisma.product.create({
      data: {
        name: 'محصول با مبدأ',
        slug: `origin-${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        originCountry: 'China',
        createdBy: actorId,
      },
    });
    createdProductIds.push(product.id);

    const updated = await service.update(
      product.id,
      { originCountry: null },
      actorId,
    );
    expect(updated.originCountry).toBeNull();

    const row = await prisma.product.findUnique({ where: { id: product.id } });
    expect(row?.originCountry).toBeNull();
  });

  it('rejects updating an ARCHIVED product with 409', async () => {
    const { id } = await createProduct({ status: ProductStatus.ARCHIVED });
    await expect(
      service.update(id, { name: 'x' }, actorId),
    ).rejects.toMatchObject({ status: 409 });
  });
});
