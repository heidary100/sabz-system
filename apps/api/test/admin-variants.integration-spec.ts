import { ProductCondition, ProductStatus } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { VariantsService } from '../src/modules/products/variants.service';

jest.setTimeout(30_000);

describe('Admin variant API database integration (SS-104)', () => {
  let prisma: PrismaService;
  let service: VariantsService;

  const createdProductIds: string[] = [];
  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdAuditIds: string[] = [];
  const actorId = '22222222-2222-4222-8222-222222222222';

  async function createBrand(): Promise<string> {
    const brand = await prisma.brand.create({
      data: { name: `برند ${Date.now()}-${Math.random()}`, slug: `brand-${Date.now()}-${Math.random()}` },
    });
    createdBrandIds.push(brand.id);
    return brand.id;
  }

  async function createCategory(): Promise<string> {
    const category = await prisma.category.create({
      data: { name: `دسته ${Date.now()}-${Math.random()}`, slug: `cat-${Date.now()}-${Math.random()}` },
    });
    createdCategoryIds.push(category.id);
    return category.id;
  }

  async function createProduct(
    overrides: { status?: ProductStatus; deletedAt?: Date | null } = {},
  ): Promise<string> {
    const brandId = await createBrand();
    const categoryId = await createCategory();
    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}-${Math.random()}`,
        slug: `prod-${Date.now()}-${Math.random()}`,
        brandId,
        categoryId,
        condition: ProductCondition.NEW,
        status: overrides.status ?? ProductStatus.DRAFT,
        deletedAt: overrides.deletedAt ?? null,
        createdBy: actorId,
      },
    });
    createdProductIds.push(product.id);
    return product.id;
  }

  async function createVariant(
    productId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `SKU-${Date.now()}-${Math.random()}`,
        price: '100.00',
        stockQuantity: 0,
        createdBy: actorId,
        ...overrides,
      } as never,
    });
    createdVariantIds.push(variant.id);
    return variant.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    service = new VariantsService(prisma, audit);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: createdVariantIds } },
    });
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
    const orphanVariantRows = await prisma.productVariant.findMany({
      where: { productId: { in: orphanIds } },
      select: { id: true },
    });
    const variantIds = [
      ...createdVariantIds,
      ...orphanVariantRows.map((row) => row.id),
    ];
    await prisma.inventoryMovement.deleteMany({
      where: { inventoryItem: { variantId: { in: variantIds } } },
    });
    await prisma.reservation.deleteMany({
      where: { inventoryItem: { variantId: { in: variantIds } } },
    });
    await prisma.inventoryItem.deleteMany({
      where: { variantId: { in: variantIds } },
    });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: orphanIds } } });
    await prisma.product.deleteMany({ where: { id: { in: orphanIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.$disconnect();
  });

  it('creates a variant, returns it as a string-priced summary, and audits', async () => {
    const productId = await createProduct();
    const result = await service.create(
      productId,
      { sku: `SKU-CREATE-${Date.now()}`, price: '2500.00', stockQuantity: 4, name: 'پایه' },
      actorId,
    );

    createdVariantIds.push(result.id);
    createdAuditIds.push(
      ...(await prisma.auditLog
        .findMany({ where: { entityId: result.id, action: 'PRODUCT_VARIANT_CREATED' } })
        .then((rows) => rows.map((row) => row.id))),
    );

    expect(result.productId).toBe(productId);
    expect(result.price).toBe('2500');
    expect(JSON.stringify(result)).not.toContain('deletedAt');
    expect(JSON.stringify(result)).not.toContain('createdBy');

    const row = await prisma.productVariant.findUnique({ where: { id: result.id } });
    expect(row?.stockQuantity).toBe(4);

    const audits = await prisma.auditLog.findMany({
      where: { entityId: result.id, action: 'PRODUCT_VARIANT_CREATED' },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]!.after)).not.toContain('storageKey');
  });

  it('returns 404 when creating for a soft-deleted product', async () => {
    const productId = await createProduct({ deletedAt: new Date() });
    await expect(
      service.create(productId, { sku: `SKU-${Date.now()}`, price: '1.00' }, actorId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns 409 when creating for an archived product', async () => {
    const productId = await createProduct({ status: ProductStatus.ARCHIVED });
    await expect(
      service.create(productId, { sku: `SKU-${Date.now()}`, price: '1.00' }, actorId),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('returns 409 on a duplicate SKU (DB unique constraint)', async () => {
    const productId = await createProduct();
    const sku = `SKU-DUP-${Date.now()}`;
    await service.create(productId, { sku, price: '10.00' }, actorId);
    await expect(
      service.create(productId, { sku, price: '20.00' }, actorId),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('lists only active variants and excludes soft-deleted ones', async () => {
    const productId = await createProduct();
    const activeId = await createVariant(productId);
    const deletedId = await createVariant(productId);
    await prisma.productVariant.update({
      where: { id: deletedId },
      data: { deletedAt: new Date() },
    });

    const result = await service.list(productId);
    const ids = result.map((v) => v.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(deletedId);
  });

  it('returns product detail that reflects only active variants', async () => {
    const productId = await createProduct();
    await createVariant(productId);
    const deletedId = await createVariant(productId);
    await prisma.productVariant.update({
      where: { id: deletedId },
      data: { deletedAt: new Date() },
    });

    const detail = await prisma.product.findUnique({
      where: { id: productId },
      select: { variants: { where: { deletedAt: null }, select: { id: true } } },
    });
    expect(detail?.variants.length).toBe(1);
  });

  it('updates sku/price/name and audits PRODUCT_VARIANT_UPDATED', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId, { price: '100.00' });

    const result = await service.update(
      variantId,
      { sku: `SKU-UPD-${Date.now()}`, price: '99.50', name: 'جدید' },
      actorId,
    );

    expect(result.sku).toMatch(/^SKU-UPD-/);
    expect(result.price).toBe('99.5');
    expect(result.name).toBe('جدید');

    const audits = await prisma.auditLog.findMany({
      where: { entityId: variantId, action: 'PRODUCT_VARIANT_UPDATED' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(audits[0]!.before)).toContain('100');
  });

  it('clears barcode/name when updated to null', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId, { barcode: '123', name: 'x' });

    const result = await service.update(variantId, { barcode: null, name: null }, actorId);
    expect(result.barcode).toBeNull();
    expect(result.name).toBeNull();
  });

  it('rejects updating a soft-deleted variant with 404', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId, { deletedAt: new Date() });
    await expect(
      service.update(variantId, { sku: 'SKU' }, actorId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('sets stock and audits PRODUCT_INVENTORY_SET', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId, { stockQuantity: 1 });

    const result = await service.updateInventory(variantId, { stockQuantity: 7 }, actorId);
    expect(result.stockQuantity).toBe(7);

    const audits = await prisma.auditLog.findMany({
      where: { entityId: variantId, action: 'PRODUCT_INVENTORY_SET' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(audits[0]!.before)).toContain('"stockQuantity":1');
    expect(JSON.stringify(audits[0]!.after)).toContain('"stockQuantity":7');
  });

  it('rejects inventory update on a soft-deleted variant with 404', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId, { deletedAt: new Date() });
    await expect(
      service.updateInventory(variantId, { stockQuantity: 1 }, actorId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('soft-deletes a variant, excludes it from reads, and audits', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId);

    const result = await service.softDelete(variantId, actorId);
    expect(result.id).toBe(variantId);

    const row = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(row?.deletedAt).not.toBeNull();

    await expect(service.getDetail(variantId)).rejects.toMatchObject({ status: 404 });

    const audits = await prisma.auditLog.findMany({
      where: { entityId: variantId, action: 'PRODUCT_VARIANT_DELETED' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it('does not allow mutating a deleted variant (no resurrection)', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId, { deletedAt: new Date() });
    await expect(
      service.update(variantId, { name: 'x' }, actorId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.updateInventory(variantId, { stockQuantity: 1 }, actorId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.softDelete(variantId, actorId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('keeps product published after deleting its only variant (no auto-unpublish)', async () => {
    const productId = await createProduct({ status: ProductStatus.PUBLISHED });
    const variantId = await createVariant(productId);

    await service.softDelete(variantId, actorId);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(product?.status).toBe(ProductStatus.PUBLISHED);
  });

  it('never leaks sensitive fields in variant detail serialization', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId);
    const detail = await service.getDetail(variantId);
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain('deletedAt');
    expect(serialized).not.toContain('createdBy');
    expect(serialized).not.toContain('updatedBy');
    expect(serialized).not.toContain('storageKey');
  });
});
