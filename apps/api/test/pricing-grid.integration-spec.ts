import { ConfigService } from '@nestjs/config';
import {
  PartnerApprovalStatus,
  PriceSourceCurrency,
  PriceStatus,
  Prisma,
  ProductCondition,
  ProductStatus,
  PromotionType,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { rialToToman, roundRialUp } from '../src/common/money/rial';
import { AuditService } from '../src/modules/audit/audit.service';
import { CurrencyService } from '../src/modules/currency/currency.service';
import { BulkPricingService } from '../src/modules/pricing/bulk-pricing.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { PublicCatalogService } from '../src/modules/products/public-catalog.service';
import { AttributesService } from '../src/modules/products/attributes.service';
import { StorefrontCacheService } from '../src/common/storefront-cache/storefront-cache.service';

jest.setTimeout(120_000);

const ACTOR_ID = '44444444-4444-4444-8444-444444444444';

describe('Pricing-grid bulk engine database integration', () => {
  let prisma: PrismaService;
  let bulk: BulkPricingService;
  let pricing: PricingService;
  let catalog: PublicCatalogService;

  const categoryIds: string[] = [];
  const productIds: string[] = [];
  const variantIds: string[] = [];
  const userIds: string[] = [];
  const partnerIds: string[] = [];
  const rateIds: string[] = [];
  const ruleIds: string[] = [];
  const overrideIds: string[] = [];

  function suffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  async function createCategory(
    parentId: string | null = null,
  ): Promise<{ id: string; name: string }> {
    const key = suffix();
    const category = await prisma.category.create({
      data: {
        name: `دسته قیمت ${key}`,
        slug: `pricing-grid-cat-${key}`,
        parentId,
      },
    });
    categoryIds.push(category.id);
    return { id: category.id, name: category.name };
  }

  async function createProduct(
    categoryId: string,
    overrides: {
      status?: ProductStatus;
      price?: string;
      discountedPrice?: string | null;
      discountStartsAt?: Date | null;
      discountEndsAt?: Date | null;
      partnerPrice?: string | null;
    } = {},
  ): Promise<{ productId: string; variantId: string; slug: string }> {
    const key = suffix();
    const product = await prisma.product.create({
      data: {
        name: `محصول قیمت ${key}`,
        slug: `pricing-grid-prod-${key}`,
        categoryId,
        condition: ProductCondition.NEW,
        status: overrides.status ?? ProductStatus.PUBLISHED,
      },
    });
    productIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `PRICING-GRID-${key}`,
        price: overrides.price ?? '10000000.00',
        discountedPrice: overrides.discountedPrice ?? null,
        discountStartsAt: overrides.discountStartsAt ?? null,
        discountEndsAt: overrides.discountEndsAt ?? null,
        partnerPrice: overrides.partnerPrice ?? null,
        priceStatus: PriceStatus.PRICED,
        createdBy: ACTOR_ID,
      },
    });
    variantIds.push(variant.id);
    return { productId: product.id, variantId: variant.id, slug: product.slug };
  }

  async function effective(productId: string, variantId: string): Promise<string> {
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
    });
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { categoryId: true },
    });
    const [categoryRule, override] = await Promise.all([
      pricing.categoryRuleFor(product.categoryId),
      pricing.productOverrideFor(productId),
    ]);
    return PricingService.resolveLine(
      variant.price,
      1,
      new Prisma.Decimal(0),
      [],
      { categoryRule, override },
      {
        regularPrice: variant.price,
        discountedPrice: variant.discountedPrice,
        discountStartsAt: variant.discountStartsAt,
        discountEndsAt: variant.discountEndsAt,
      },
    ).toString();
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const cache = new StorefrontCacheService(new ConfigService());
    pricing = new PricingService(prisma);
    bulk = new BulkPricingService(prisma, pricing, audit, cache);
    catalog = new PublicCatalogService(
      prisma,
      pricing,
      new AttributesService(prisma),
    );
  });

  afterAll(async () => {
    await prisma.productPriceOverride.deleteMany({
      where: { id: { in: overrideIds } },
    });
    await prisma.productPriceOverride.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.categoryPriceRule.deleteMany({
      where: { id: { in: ruleIds } },
    });
    await prisma.categoryPriceRule.deleteMany({
      where: { categoryId: { in: categoryIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { userId: ACTOR_ID },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { in: variantIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.currencyRate.deleteMany({ where: { id: { in: rateIds } } });
    await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('rounds customer Rial up and converts to Toman exactly once', () => {
    expect(roundRialUp(7_650_000).toString()).toBe('7700000');
    expect(rialToToman(7_700_000).toString()).toBe('770000');
    expect(roundRialUp(7_700_000).toString()).toBe('7700000');
  });

  it('previews and atomically applies a fixed discount with exact before/after', async () => {
    const category = await createCategory();
    const a = await createProduct(category.id, { price: '10000000' });
    const b = await createProduct(category.id, { price: '12000000' });

    const preview = await bulk.preview({
      scope: { type: 'VARIANTS', variantIds: [a.variantId, b.variantId] },
      operation: { kind: 'APPLY_DISCOUNT', mode: 'FIXED', value: '1000000' },
    });
    expect(preview.total).toBe(2);
    expect(preview.affected).toBe(2);
    expect(preview.failed).toBe(0);
    const byVariant = new Map(preview.rows.map((row) => [row.variantId, row]));
    expect(byVariant.get(a.variantId)!.discountedPriceAfter).toBe('9000000');
    expect(byVariant.get(b.variantId)!.discountedPriceAfter).toBe('11000000');

    const applied = await bulk.apply(ACTOR_ID, {
      scope: { type: 'VARIANTS', variantIds: [a.variantId, b.variantId] },
      operation: { kind: 'APPLY_DISCOUNT', mode: 'FIXED', value: '1000000' },
      previewToken: preview.previewToken,
    });
    expect(applied.applied).toBe(true);
    expect(applied.summary).toMatchObject({ affected: 2, failed: 0 });
    await expect(effective(a.productId, a.variantId)).resolves.toBe('9000000');
    await expect(effective(b.productId, b.variantId)).resolves.toBe('11000000');
    const productA = await prisma.product.findUniqueOrThrow({
      where: { id: a.productId },
    });
    expect(productA.minPrice?.toString()).toBe('9000000');
    const audit = await prisma.auditLog.findFirst({
      where: { userId: ACTOR_ID, action: 'BULK_PRICE_OPERATION_APPLIED' },
    });
    expect(audit).not.toBeNull();
  });

  it('applies a percentage discount and refuses a discount that would zero the price', async () => {
    const category = await createCategory();
    const p = await createProduct(category.id, { price: '10000000' });
    const preview = await bulk.preview({
      scope: { type: 'PRODUCTS', productIds: [p.productId] },
      operation: { kind: 'APPLY_DISCOUNT', mode: 'PERCENT', value: '10' },
    });
    expect(preview.rows[0]!.discountedPriceAfter).toBe('9000000');

    const invalid = await bulk.preview({
      scope: { type: 'VARIANTS', variantIds: [p.variantId] },
      operation: { kind: 'APPLY_DISCOUNT', mode: 'FIXED', value: '10000000' },
    });
    expect(invalid.failed).toBe(1);
    const outcome = await bulk.apply(ACTOR_ID, {
      scope: { type: 'VARIANTS', variantIds: [p.variantId] },
      operation: { kind: 'APPLY_DISCOUNT', mode: 'FIXED', value: '10000000' },
      previewToken: invalid.previewToken,
    });
    expect(outcome.applied).toBe(false);
    const row = await prisma.productVariant.findUniqueOrThrow({
      where: { id: p.variantId },
    });
    expect(row.discountedPrice).toBeNull();
  });

  it('clears a discount safely', async () => {
    const category = await createCategory();
    const p = await createProduct(category.id, {
      price: '10000000',
      discountedPrice: '9000000',
    });
    const preview = await bulk.preview({
      scope: { type: 'VARIANTS', variantIds: [p.variantId] },
      operation: { kind: 'CLEAR_DISCOUNT' },
    });
    expect(preview.rows[0]!.discountedPriceAfter).toBeNull();
    const applied = await bulk.apply(ACTOR_ID, {
      scope: { type: 'VARIANTS', variantIds: [p.variantId] },
      operation: { kind: 'CLEAR_DISCOUNT' },
      previewToken: preview.previewToken,
    });
    expect(applied.applied).toBe(true);
    await expect(effective(p.productId, p.variantId)).resolves.toBe('10000000');
  });

  it('applies a percentage regular-price adjustment without confusing it with a discount', async () => {
    const category = await createCategory();
    const p = await createProduct(category.id, { price: '10000000' });
    const preview = await bulk.preview({
      scope: { type: 'VARIANTS', variantIds: [p.variantId] },
      operation: {
        kind: 'ADJUST_REGULAR_PRICE',
        mode: 'PERCENT',
        direction: 'INCREASE',
        value: '10',
      },
    });
    expect(preview.rows[0]!.regularPriceAfter).toBe('11000000');
    expect(preview.rows[0]!.discountedPriceAfter).toBeNull();
    await bulk.apply(ACTOR_ID, {
      scope: { type: 'VARIANTS', variantIds: [p.variantId] },
      operation: {
        kind: 'ADJUST_REGULAR_PRICE',
        mode: 'PERCENT',
        direction: 'INCREASE',
        value: '10',
      },
      previewToken: preview.previewToken,
    });
    const row = await prisma.productVariant.findUniqueOrThrow({
      where: { id: p.variantId },
    });
    expect(row.price.toString()).toBe('11000000');
  });

  it('applies category rules to descendants and respects the schedule', async () => {
    const parent = await createCategory();
    const child = await createCategory(parent.id);
    const parentProduct = await createProduct(parent.id, { price: '10000000' });
    const childProduct = await createProduct(child.id, { price: '10000000' });

    const preview = await bulk.previewCategoryRule({
      categoryId: parent.id,
      includeDescendants: true,
      type: PromotionType.PERCENT,
      value: '20',
    });
    expect(preview.rows.map((row) => row.variantId).sort()).toEqual(
      [parentProduct.variantId, childProduct.variantId].sort(),
    );
    expect(preview.affected).toBe(2);

    const rule = await prisma.categoryPriceRule.create({
      data: {
        categoryId: parent.id,
        type: PromotionType.PERCENT,
        value: new Prisma.Decimal(20),
        includeDescendants: true,
        isActive: true,
      },
    });
    ruleIds.push(rule.id);
    await expect(effective(childProduct.productId, childProduct.variantId)).resolves.toBe(
      '8000000',
    );

    // A future rule is not active yet.
    await prisma.categoryPriceRule.update({
      where: { id: rule.id },
      data: { startsAt: new Date(Date.now() + 86_400_000) },
    });
    await expect(effective(childProduct.productId, childProduct.variantId)).resolves.toBe(
      '10000000',
    );

    // Only products directly in the parent remain under a non-descendant rule.
    await prisma.categoryPriceRule.update({
      where: { id: rule.id },
      data: { startsAt: null, includeDescendants: false },
    });
    await expect(effective(childProduct.productId, childProduct.variantId)).resolves.toBe(
      '10000000',
    );
    await expect(effective(parentProduct.productId, parentProduct.variantId)).resolves.toBe(
      '8000000',
    );
  });

  it('projects category rules and overrides into public cards and product detail', async () => {
    const category = await createCategory();
    const product = await createProduct(category.id, { price: '10000000' });
    const rule = await prisma.categoryPriceRule.create({
      data: {
        categoryId: category.id,
        type: PromotionType.PERCENT,
        value: new Prisma.Decimal(20),
        isActive: true,
      },
    });
    ruleIds.push(rule.id);

    const card = (await catalog.getVisibleCardsByIds([product.productId]))[0]!;
    expect(card.priceFrom).toBe('8000000');
    expect(card.regularPrice).toBe('10000000');
    const detail = await catalog.getProductBySlug(product.slug);
    expect(detail.variants[0]!.price).toBe('8000000');
    expect(detail.variants[0]!.regularPrice).toBe('10000000');

    // A fixed discount larger than the price must never publish a free item.
    await prisma.categoryPriceRule.update({
      where: { id: rule.id },
      data: { type: PromotionType.FIXED, value: new Prisma.Decimal(20000000) },
    });
    const notFree = (await catalog.getVisibleCardsByIds([product.productId]))[0]!;
    expect(notFree.priceFrom).toBe('10000000');
    expect(notFree.regularPrice).toBeNull();

    // An absolute product override is projected consistently too.
    const override = await prisma.productPriceOverride.create({
      data: {
        productId: product.productId,
        overridePrice: new Prisma.Decimal(7000000),
        isActive: true,
      },
    });
    overrideIds.push(override.id);
    const overridden = (await catalog.getVisibleCardsByIds([product.productId]))[0]!;
    expect(overridden.priceFrom).toBe('7000000');
    expect(overridden.regularPrice).toBe('10000000');
    const overriddenDetail = await catalog.getProductBySlug(product.slug);
    expect(overriddenDetail.variants[0]!.price).toBe('7000000');
  });

  it('sets an absolute override, exposes it in the effective price, and clears it', async () => {
    const category = await createCategory();
    const p = await createProduct(category.id, { price: '10000000' });
    const preview = await bulk.preview({
      scope: { type: 'PRODUCTS', productIds: [p.productId] },
      operation: { kind: 'SET_OVERRIDE', overridePrice: '7500000' },
    });
    expect(preview.affected).toBe(1);
    expect(preview.rows[0]!.effectivePriceAfter).toBe('7500000');
    await bulk.apply(ACTOR_ID, {
      scope: { type: 'PRODUCTS', productIds: [p.productId] },
      operation: { kind: 'SET_OVERRIDE', overridePrice: '7500000' },
      previewToken: preview.previewToken,
    });
    await expect(effective(p.productId, p.variantId)).resolves.toBe('7500000');

    const clearPreview = await bulk.preview({
      scope: { type: 'PRODUCTS', productIds: [p.productId] },
      operation: { kind: 'CLEAR_OVERRIDE' },
    });
    await bulk.apply(ACTOR_ID, {
      scope: { type: 'PRODUCTS', productIds: [p.productId] },
      operation: { kind: 'CLEAR_OVERRIDE' },
      previewToken: clearPreview.previewToken,
    });
    await expect(effective(p.productId, p.variantId)).resolves.toBe('10000000');
  });

  it('rejects a stale preview after a concurrent edit and writes nothing', async () => {
    const category = await createCategory();
    const p = await createProduct(category.id, { price: '10000000' });
    const preview = await bulk.preview({
      scope: { type: 'VARIANTS', variantIds: [p.variantId] },
      operation: { kind: 'APPLY_DISCOUNT', mode: 'FIXED', value: '1000000' },
    });
    await prisma.productVariant.update({
      where: { id: p.variantId },
      data: { price: '12000000' },
    });
    await expect(
      bulk.apply(ACTOR_ID, {
        scope: { type: 'VARIANTS', variantIds: [p.variantId] },
        operation: { kind: 'APPLY_DISCOUNT', mode: 'FIXED', value: '1000000' },
        previewToken: preview.previewToken,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const row = await prisma.productVariant.findUniqueOrThrow({
      where: { id: p.variantId },
    });
    expect(row.discountedPrice).toBeNull();
    expect(row.price.toString()).toBe('12000000');
  });

  it('does not stack an active sale with a category rule or override', async () => {
    const category = await createCategory();
    const p = await createProduct(category.id, {
      price: '10000000',
      discountedPrice: '9000000',
    });
    const rule = await prisma.categoryPriceRule.create({
      data: {
        categoryId: category.id,
        type: PromotionType.PERCENT,
        value: new Prisma.Decimal(50),
        isActive: true,
      },
    });
    ruleIds.push(rule.id);
    await expect(effective(p.productId, p.variantId)).resolves.toBe('9000000');
  });

  it('recalculates source-currency prices atomically and audits the rate', async () => {
    const category = await createCategory();
    const p = await createProduct(category.id, { price: '90000000' });
    await prisma.productVariant.update({
      where: { id: p.variantId },
      data: {
        priceSourceCurrency: PriceSourceCurrency.USD,
        priceSourceAmount: new Prisma.Decimal(100),
        priceSourceRate: new Prisma.Decimal(900000),
        priceUpdatedAt: new Date(),
      },
    });
    const currency = new CurrencyService(
      prisma,
      new AuditService(prisma),
      new StorefrontCacheService(new ConfigService()),
    );
    const preview = await currency.previewRecalculation({
      currency: 'USD',
      rialPerUnit: '950000',
    });
    const row = preview.rows.find((item) => item.variantId === p.variantId);
    expect(row).toBeDefined();
    expect(row!.proposedRegularPrice).toBe('95000000');
    const applied = await currency.applyRecalculation(
      {
        currency: 'USD',
        rialPerUnit: '950000',
        previewToken: preview.previewToken,
      },
      ACTOR_ID,
    );
    expect(applied.affected).toBeGreaterThanOrEqual(1);
    rateIds.push(applied.rateId);
    const updated = await prisma.productVariant.findUniqueOrThrow({
      where: { id: p.variantId },
    });
    expect(updated.price.toString()).toBe('95000000');
    expect(updated.priceSourceRate?.toString()).toBe('950000');
    expect(updated.priceUpdatedAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: {
        userId: ACTOR_ID,
        action: 'CURRENCY_RATE_RECALCULATED',
      },
    });
    expect(audit).not.toBeNull();
  });

  it('never exposes the B2B partner price to guests or in public detail', async () => {
    const category = await createCategory();
    const p = await createProduct(category.id, {
      price: '10000000',
      partnerPrice: '7000000',
    });
    const guest = await catalog.getPriceBySlug(p.slug, null, 1);
    expect(guest.quotes[0]!.resolvedPrice).toBe('10000000');
    expect(JSON.stringify(guest)).not.toContain('7000000');

    const mobile = `+989${String(Date.now()).slice(-9)}`;
    const user = await prisma.user.create({
      data: { mobile, status: UserStatus.ACTIVE },
    });
    userIds.push(user.id);
    const profile = await prisma.userProfile.create({
      data: { userId: user.id, firstName: 'همکار', lastName: 'تست' },
    });
    const partner = await prisma.partner.create({
      data: {
        profileId: profile.id,
        businessName: `همکار ${suffix()}`,
        approvalStatus: PartnerApprovalStatus.APPROVED,
      },
    });
    partnerIds.push(partner.id);

    const partnerQuote = await catalog.getPriceBySlug(p.slug, user.id, 1);
    expect(partnerQuote.quotes[0]!.resolvedPrice).toBe('7000000');
    expect(partnerQuote.tierApplied).toBe(true);

    const detail = await catalog.getProductBySlug(p.slug);
    expect(JSON.stringify(detail)).not.toContain('7000000');
    expect(Object.keys(detail.variants[0]!)).not.toContain('partnerPrice');
  });
});
