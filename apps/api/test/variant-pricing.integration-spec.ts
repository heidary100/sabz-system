import { PriceStatus, ProductCondition, ProductStatus } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { recomputeProductMinPrice } from '../src/modules/products/min-price';
import { PublicCatalogService } from '../src/modules/products/public-catalog.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { VariantsService } from '../src/modules/products/variants.service';

import { StorefrontCacheService } from '../src/common/storefront-cache/storefront-cache.service';
import { ConfigService } from '@nestjs/config';
jest.setTimeout(30_000);

/**
 * Variant pricing database integration (SS-201).
 *
 * Covers the sale/call-for-price domain: column defaults, service validation
 * against stored rows, and the public card/detail derivation (priceFrom over
 * PRICED only, callForPrice, variantCount, compareAt exposure).
 */
describe('Variant pricing database integration (SS-201)', () => {
  let prisma: PrismaService;
  let variants: VariantsService;
  let catalog: PublicCatalogService;

  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const actorId = '33333333-3333-4333-8333-333333333333';

  function uniqueSuffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  async function createProduct(status: ProductStatus = ProductStatus.DRAFT): Promise<{ id: string }> {
    const suffix = uniqueSuffix();
    const brand = await prisma.brand.create({
      data: { name: `برند ${suffix}`, slug: `brand-vp-${suffix}` },
    });
    createdBrandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته ${suffix}`, slug: `cat-vp-${suffix}` },
    });
    createdCategoryIds.push(category.id);
    const product = await prisma.product.create({
      data: {
        name: `محصول ${suffix}`,
        slug: `prod-vp-${suffix}`,
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

  async function addVariant(
    productId: string,
    overrides: {
      price?: string;
      compareAtPrice?: string | null;
      priceStatus?: PriceStatus;
    } = {},
  ): Promise<{ id: string }> {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `SKU-VP-${uniqueSuffix()}`,
        price: overrides.price ?? '100.00',
        compareAtPrice: overrides.compareAtPrice ?? null,
        priceStatus: overrides.priceStatus ?? PriceStatus.PRICED,
        createdBy: actorId,
      },
    });
    createdVariantIds.push(variant.id);
    // SS-217: raw fixture writes bypass the service writer, so maintain the
    // denormalized column explicitly.
    await recomputeProductMinPrice(prisma, productId);
    return { id: variant.id };
  }

  async function publish(productId: string): Promise<void> {
    await prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.PUBLISHED },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    variants = new VariantsService(prisma, audit, new StorefrontCacheService(new ConfigService()));
    catalog = new PublicCatalogService(prisma, new PricingService(prisma));
  });

  afterAll(async () => {
    await prisma.productVariant.deleteMany({
      where: { id: { in: createdVariantIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({
      where: { id: { in: createdCategoryIds } },
    });
    await prisma.$disconnect();
  });

  it('defaults stored variants to PRICED with null compareAtPrice', async () => {
    const { id } = await createProduct();
    const { id: variantId } = await addVariant(id);

    const row = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    });
    expect(row.priceStatus).toBe(PriceStatus.PRICED);
    expect(row.compareAtPrice).toBeNull();
  });

  it('creates a sale variant through the service with audit trail', async () => {
    const { id } = await createProduct();
    const summary = await variants.create(
      id,
      { sku: `SKU-VP-${uniqueSuffix()}`, price: '1500.00', compareAtPrice: '1800.00' },
      actorId,
    );
    createdVariantIds.push(summary.id);

    expect(summary.compareAtPrice).toBe('1800');
    expect(summary.priceStatus).toBe(PriceStatus.PRICED);
  });

  it('rejects invalid pricing transitions against stored rows', async () => {
    const { id } = await createProduct();
    const { id: variantId } = await addVariant(id, {
      price: '1500.00',
      compareAtPrice: '1800.00',
    });

    // Lowering price to the compare-at mark must fail.
    await expect(
      variants.update(variantId, { price: '1800.00' }, actorId),
    ).rejects.toMatchObject({ status: 400 });

    // Flipping to CALL_FOR_PRICE while a sale reference exists must fail.
    await expect(
      variants.update(variantId, { priceStatus: PriceStatus.CALL_FOR_PRICE }, actorId),
    ).rejects.toMatchObject({ status: 400 });

    // Clearing the reference first, then flipping, succeeds.
    const cleared = await variants.update(
      variantId,
      { compareAtPrice: null, priceStatus: PriceStatus.CALL_FOR_PRICE },
      actorId,
    );
    expect(cleared.compareAtPrice).toBeNull();
    expect(cleared.priceStatus).toBe(PriceStatus.CALL_FOR_PRICE);
  });

  it('derives card pricing over PRICED variants only', async () => {
    const { id } = await createProduct(ProductStatus.PUBLISHED);
    const slug = (
      await prisma.product.findUniqueOrThrow({ where: { id }, select: { slug: true } })
    ).slug;
    await addVariant(id, { price: '200.00', compareAtPrice: '250.00' });
    await addVariant(id, {
      price: '0',
      priceStatus: PriceStatus.CALL_FOR_PRICE,
    });

    const page = await catalog.listProducts({ page: 1, limit: 50 });
    const card = page.items.find((item) => item.slug === slug);
    expect(card).toBeDefined();
    expect(card!.priceFrom).toBe('200');
    expect(card!.callForPrice).toBe(false);
    expect(card!.variantCount).toBe(2);
  });

  it('marks an all-call-for-price product with empty priceFrom', async () => {
    const { id } = await createProduct(ProductStatus.PUBLISHED);
    const slug = (
      await prisma.product.findUniqueOrThrow({ where: { id }, select: { slug: true } })
    ).slug;
    await addVariant(id, { price: '0', priceStatus: PriceStatus.CALL_FOR_PRICE });
    await publish(id);

    const page = await catalog.listProducts({ page: 1, limit: 50 });
    const card = page.items.find((item) => item.slug === slug);
    expect(card).toBeDefined();
    expect(card!.priceFrom).toBe('');
    expect(card!.callForPrice).toBe(true);
    expect(card!.variantCount).toBe(1);
  });

  it('exposes compareAtPrice and priceStatus on the detail DTO', async () => {
    const { id } = await createProduct(ProductStatus.PUBLISHED);
    const slug = (
      await prisma.product.findUniqueOrThrow({ where: { id }, select: { slug: true } })
    ).slug;
    await addVariant(id, { price: '1500.00', compareAtPrice: '1800.00' });

    const detail = await catalog.getProductBySlug(slug);
    expect(detail.variants).toHaveLength(1);
    expect(detail.variants[0]!.compareAtPrice).toBe('1800');
    expect(detail.variants[0]!.priceStatus).toBe(PriceStatus.PRICED);
  });

  it('sorts call-for-price products after priced ones', async () => {
    const priced = await createProduct(ProductStatus.PUBLISHED);
    await addVariant(priced.id, { price: '500.00' });
    const unpriced = await createProduct(ProductStatus.PUBLISHED);
    const unpricedSlug = (
      await prisma.product.findUniqueOrThrow({
        where: { id: unpriced.id },
        select: { slug: true },
      })
    ).slug;
    await addVariant(unpriced.id, {
      price: '0',
      priceStatus: PriceStatus.CALL_FOR_PRICE,
    });

    const page = await catalog.listProducts({
      page: 1,
      limit: 50,
      sort: 'price_asc',
    });
    const slugs = page.items.map((item) => item.slug);
    const pricedSlug = (
      await prisma.product.findUniqueOrThrow({
        where: { id: priced.id },
        select: { slug: true },
      })
    ).slug;
    expect(slugs.indexOf(pricedSlug)).toBeLessThan(slugs.indexOf(unpricedSlug));
  });
});
