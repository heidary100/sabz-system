import { AttributeType, ProductCondition, ProductStatus } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  ATTRIBUTE_SOURCE_WOO_ATTR,
  ATTRIBUTE_SOURCE_WOO_CUSTOM,
  AttributesService,
} from '../src/modules/products/attributes.service';
import { PublicCatalogService } from '../src/modules/products/public-catalog.service';
import { PricingService } from '../src/modules/pricing/pricing.service';

jest.setTimeout(30_000);

/**
 * Attribute/spec domain database integration (SS-202, ADR-005).
 *
 * Covers definition idempotency, spec ordering, variant set-semantics,
 * delete guards, cascades, and public detail exposure.
 */
describe('Attribute/spec database integration (SS-202)', () => {
  let prisma: PrismaService;
  let attributes: AttributesService;
  let catalog: PublicCatalogService;

  const createdAttributeIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const actorId = '44444444-4444-4344-8444-444444444444';

  function uniqueSuffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  async function createProduct(status: ProductStatus = ProductStatus.DRAFT): Promise<{ id: string }> {
    const suffix = uniqueSuffix();
    const brand = await prisma.brand.create({
      data: { name: `برند ${suffix}`, slug: `brand-as-${suffix}` },
    });
    createdBrandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته ${suffix}`, slug: `cat-as-${suffix}` },
    });
    createdCategoryIds.push(category.id);
    const product = await prisma.product.create({
      data: {
        name: `محصول ${suffix}`,
        slug: `prod-as-${suffix}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        status,
        createdBy: actorId,
      },
    });
    createdProductIds.push(product.id);
    return { id: product.id };
  }

  async function addVariant(productId: string): Promise<{ id: string }> {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `SKU-AS-${uniqueSuffix()}`,
        price: '100.00',
        createdBy: actorId,
      },
    });
    createdVariantIds.push(variant.id);
    return { id: variant.id };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    attributes = new AttributesService(prisma);
    catalog = new PublicCatalogService(prisma, new PricingService(prisma), new AttributesService(prisma));
  });

  afterAll(async () => {
    await prisma.productAttributeValue.deleteMany({
      where: { productId: { in: createdProductIds } },
    });
    await prisma.variantAttributeValue.deleteMany({
      where: { variantId: { in: createdVariantIds } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { in: createdVariantIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
    await prisma.categoryAttribute.deleteMany({
      where: { categoryId: { in: createdCategoryIds } },
    });
    await prisma.attributeValue.deleteMany({
      where: { attributeId: { in: createdAttributeIds } },
    });
    await prisma.attribute.deleteMany({
      where: { id: { in: createdAttributeIds } },
    });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({
      where: { id: { in: createdCategoryIds } },
    });
    await prisma.$disconnect();
  });

  it('upserts definitions idempotently and rejects type reuse', async () => {
    const first = await attributes.upsertAttribute({
      name: `رنگ ${uniqueSuffix()}`,
      slug: `color-${uniqueSuffix()}`,
      type: AttributeType.VARIANT_OPTION,
      isGlobal: true,
    });
    createdAttributeIds.push(first.id);

    const second = await attributes.upsertAttribute({
      name: first.name,
      slug: `other-${uniqueSuffix()}`,
      type: AttributeType.VARIANT_OPTION,
      isFilterable: true,
    });
    expect(second.id).toBe(first.id);
    expect(second.isFilterable).toBe(true);
    // Slug is identity-adjacent: re-upsert never renames.
    expect(second.slug).toBe(first.slug);

    await expect(
      attributes.upsertAttribute({
        name: first.name,
        slug: `spec-${uniqueSuffix()}`,
        type: AttributeType.SPEC,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('assigns ordered specs and rejects duplicates', async () => {
    const { id } = await createProduct();
    const suffix = uniqueSuffix();

    await attributes.assignSpec(id, {
      attributeName: `حافظه ${suffix}`,
      attributeSlug: `mem-${suffix}`,
      value: '1 ترابایت',
      valueSlug: '1tb',
      sortOrder: 2,
      source: ATTRIBUTE_SOURCE_WOO_CUSTOM,
    });
    await attributes.assignSpec(id, {
      attributeName: `پردازنده ${suffix}`,
      attributeSlug: `cpu-${suffix}`,
      group: 'سخت‌افزار',
      value: 'Core i7',
      valueSlug: 'core-i7',
      sortOrder: 1,
      source: ATTRIBUTE_SOURCE_WOO_ATTR,
    });

    const specs = await attributes.listProductSpecs(id);
    expect(specs.map((spec) => spec.sortOrder)).toEqual([1, 2]);
    expect(specs[0]!.attributeValue.attribute.group).toBe('سخت‌افزار');
    expect(specs[1]!.attributeValue.value).toBe('1 ترابایت');

    await expect(
      attributes.assignSpec(id, {
        attributeName: `حافظه ${suffix}`,
        attributeSlug: `mem-${suffix}`,
        value: '1 ترابایت',
        valueSlug: '1tb',
        source: ATTRIBUTE_SOURCE_WOO_CUSTOM,
      }),
    ).rejects.toMatchObject({ status: 409 });

    const rows = await prisma.attribute.findMany({
      where: { name: { in: [`حافظه ${suffix}`, `پردازنده ${suffix}`] } },
      select: { id: true },
    });
    for (const row of rows) {
      createdAttributeIds.push(row.id);
    }
  });

  it('enforces variant set-semantics: one value per attribute', async () => {
    const { id } = await createProduct();
    const { id: variantId } = await addVariant(id);
    const suffix = uniqueSuffix();

    await attributes.setVariantOption(variantId, {
      attributeName: `رنگ ${suffix}`,
      attributeSlug: `color-${suffix}`,
      value: 'مشکی',
      valueSlug: 'black',
    });
    await attributes.setVariantOption(variantId, {
      attributeName: `رنگ ${suffix}`,
      attributeSlug: `color-${suffix}`,
      value: 'سفید',
      valueSlug: 'white',
    });

    const options = await prisma.variantAttributeValue.findMany({
      where: { variantId },
      include: { attributeValue: true },
    });
    expect(options).toHaveLength(1);
    expect(options[0]!.attributeValue.value).toBe('سفید');

    // Re-setting the same value is a stable no-op.
    await attributes.setVariantOption(variantId, {
      attributeName: `رنگ ${suffix}`,
      attributeSlug: `color-${suffix}`,
      value: 'سفید',
      valueSlug: 'white',
    });
    expect(
      await prisma.variantAttributeValue.count({ where: { variantId } }),
    ).toBe(1);

    const attribute = await prisma.attribute.findUniqueOrThrow({
      where: { name: `رنگ ${suffix}` },
    });
    createdAttributeIds.push(attribute.id);
  });

  it('guards deletes and cascades assignments with their owners', async () => {
    const attribute = await attributes.upsertAttribute({
      name: `گارانتی‌نما ${uniqueSuffix()}`,
      slug: `warranty-${uniqueSuffix()}`,
      type: AttributeType.SPEC,
    });
    createdAttributeIds.push(attribute.id);
    await expect(attributes.deleteAttribute(attribute.id)).resolves.toBeUndefined();

    const guarded = await attributes.upsertAttribute({
      name: `ظرفیت ${uniqueSuffix()}`,
      slug: `cap-${uniqueSuffix()}`,
      type: AttributeType.SPEC,
    });
    createdAttributeIds.push(guarded.id);
    const { id } = await createProduct();
    await attributes.assignSpec(id, {
      attributeName: guarded.name,
      attributeSlug: guarded.slug,
      value: '512 گیگ',
      valueSlug: '512gb',
      source: ATTRIBUTE_SOURCE_WOO_ATTR,
    });
    await expect(attributes.deleteAttribute(guarded.id)).rejects.toMatchObject({
      status: 409,
    });

    // Deleting the product cascades its spec rows.
    await prisma.product.delete({ where: { id } });
    createdProductIds.splice(createdProductIds.indexOf(id), 1);
    expect(
      await prisma.productAttributeValue.count({ where: { productId: id } }),
    ).toBe(0);
  });

  it('exposes ordered specs on the public detail DTO', async () => {
    const { id } = await createProduct(ProductStatus.PUBLISHED);
    const slug = (
      await prisma.product.findUniqueOrThrow({
        where: { id },
        select: { slug: true },
      })
    ).slug;
    const suffix = uniqueSuffix();
    await attributes.assignSpec(id, {
      attributeName: `صفحه‌نمایش ${suffix}`,
      attributeSlug: `display-${suffix}`,
      value: '15.6 اینچ',
      valueSlug: '15-6-inch',
      sortOrder: 2,
      source: ATTRIBUTE_SOURCE_WOO_ATTR,
    });
    await attributes.assignSpec(id, {
      attributeName: `پردازنده ${suffix}`,
      attributeSlug: `cpu-${suffix}`,
      value: 'Core i7',
      valueSlug: 'core-i7',
      sortOrder: 1,
      source: ATTRIBUTE_SOURCE_WOO_ATTR,
    });
    for (const name of [`صفحه‌نمایش ${suffix}`, `پردازنده ${suffix}`]) {
      const row = await prisma.attribute.findUniqueOrThrow({ where: { name } });
      createdAttributeIds.push(row.id);
    }

    const detail = await catalog.getProductBySlug(slug);
    expect(detail.specs.map((spec) => spec.attributeName)).toEqual([
      `پردازنده ${suffix}`,
      `صفحه‌نمایش ${suffix}`,
    ]);
    expect(detail.specs[0]).toMatchObject({
      value: 'Core i7',
      valueSlug: 'core-i7',
      sortOrder: 1,
    });
  });
});


describe('Category-aware attributes + bulk editing (SS-900)', () => {
  let prisma: PrismaService;
  let attributes: AttributesService;
  const actorId = '55555555-5555-4555-8555-555555555555';
  const attributeIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];
  const brandIds: string[] = [];

  function suffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  async function makeCategory(name: string, parentId: string | null = null) {
    const row = await prisma.category.create({
      data: { name: `${name} ${suffix()}`, slug: `cat-ss900-${suffix()}`, parentId },
    });
    categoryIds.push(row.id);
    return row;
  }

  async function makeProduct(categoryId: string) {
    const brand = await prisma.brand.create({
      data: { name: `برند SS900 ${suffix()}`, slug: `brand-ss900-${suffix()}` },
    });
    brandIds.push(brand.id);
    const row = await prisma.product.create({
      data: {
        name: `محصول SS900 ${suffix()}`,
        slug: `product-ss900-${suffix()}`,
        brandId: brand.id,
        categoryId,
        condition: ProductCondition.NEW,
        status: ProductStatus.DRAFT,
        createdBy: actorId,
      },
    });
    productIds.push(row.id);
    return row;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    attributes = new AttributesService(prisma);
  });

  afterAll(async () => {
    await prisma.productAttributeValue.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.categoryAttribute.deleteMany({ where: { categoryId: { in: categoryIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.attributeValue.deleteMany({ where: { attributeId: { in: attributeIds } } });
    await prisma.attribute.deleteMany({ where: { id: { in: attributeIds } } });
    await prisma.$disconnect();
  });

  it('resolves parent assignments with child overrides and validates typed values', async () => {
    const parent = await makeCategory('والد');
    const child = await makeCategory('فرزند', parent.id);
    const ram = await attributes.createAttribute({
      name: `حافظه ${suffix()}`,
      slug: `ram-${suffix()}`,
      type: AttributeType.SPEC,
      valueType: 'SELECT',
      isFilterable: true,
    });
    const screen = await attributes.createAttribute({
      name: `اندازه صفحه ${suffix()}`,
      slug: `screen-${suffix()}`,
      type: AttributeType.SPEC,
      valueType: 'NUMBER',
      unit: 'اینچ',
    });
    attributeIds.push(ram.id, screen.id);
    const ramValue = await attributes.createAttributeValue(ram.id, {
      value: '16GB',
      slug: `16gb-${suffix()}`,
    });

    await attributes.setCategoryAttributes(
      parent.id,
      [{ attributeId: ram.id, isRequired: true, isFilterable: true, isComparable: true }],
      actorId,
    );
    await attributes.setCategoryAttributes(
      child.id,
      [{ attributeId: screen.id, isRequired: true, isComparable: true }],
      actorId,
    );

    const resolved = await attributes.resolvedCategoryAttributes(child.id);
    expect(resolved.map((row) => row.attribute.id).sort()).toEqual(
      [ram.id, screen.id].sort(),
    );
    const inheritedRam = resolved.find((row) => row.attribute.id === ram.id)!;
    expect(inheritedRam.inheritedFromCategoryId).toBe(parent.id);
    expect(inheritedRam.isRequired).toBe(true);

    const product = await makeProduct(child.id);
    await expect(
      attributes.setProductAttributes(
        product.id,
        { values: [] },
        actorId,
      ),
    ).rejects.toMatchObject({ status: 400 });

    const saved = await attributes.setProductAttributes(
      product.id,
      {
        values: [
          { attributeId: ram.id, optionId: ramValue.id },
          { attributeId: screen.id, valueNumber: '15.6' },
        ],
      },
      actorId,
    );
    expect(saved.values).toHaveLength(2);
    expect(saved.values.find((row) => row.attribute.id === screen.id)).toMatchObject({
      valueNumber: '15.6',
      option: null,
    });
    await expect(
      attributes.clearProductAttribute(product.id, ram.id),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('previews and applies bulk operations with a bound token and per-product outcomes', async () => {
    const category = await makeCategory('گروه ویرایش');
    const attribute = await attributes.createAttribute({
      name: `گارانتی ${suffix()}`,
      slug: `warranty-${suffix()}`,
      type: AttributeType.SPEC,
      valueType: 'TEXT',
    });
    attributeIds.push(attribute.id);
    await attributes.setCategoryAttributes(
      category.id,
      [{ attributeId: attribute.id, isFilterable: true }],
      actorId,
    );
    const first = await makeProduct(category.id);
    const second = await makeProduct(category.id);
    const input = {
      products: [
        { id: first.id, updatedAt: first.updatedAt.toISOString() },
        { id: second.id, updatedAt: second.updatedAt.toISOString() },
      ],
      operations: [
        { kind: 'SET' as const, attributeId: attribute.id, valueText: '۱۸ ماه' },
      ],
    };
    const preview = await attributes.previewBulk(input);
    expect(preview.affectedProducts).toBe(2);
    expect(preview.previewToken).toMatch(/^[a-f0-9]{64}$/);

    const applied = await attributes.applyBulk(
      { ...input, previewToken: preview.previewToken },
      actorId,
    );
    expect(applied.applied).toBe(2);
    expect(applied.failed).toBe(0);
    const after = await attributes.getProductAttributes(first.id);
    expect(after.values[0]).toMatchObject({ valueText: '۱۸ ماه' });

    await expect(
      attributes.applyBulk({ ...input, previewToken: 'stale' }, actorId),
    ).rejects.toMatchObject({ status: 409 });
  });
});
