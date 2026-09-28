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
    catalog = new PublicCatalogService(prisma, new PricingService(prisma));
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
