import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PriceStatus,
  ProductCondition,
  ProductStatus,
  WarehouseStatus,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { AttributesService } from '../src/modules/products/attributes.service';
import { TagsService } from '../src/modules/products/tags.service';

jest.setTimeout(60_000);

const CATEGORIES_BASE = '/api/v1/catalog/categories';
const BRANDS_BASE = '/api/v1/catalog/brands';
const PRODUCTS_BASE = '/api/v1/catalog/products';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
}

/** Dot-free unique suffix — safe inside server-validated slugs. */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Public catalog read API (SS-120 categories/brands, SS-121 listing,
 * SS-122 detail). The suites prove the storefront contract: only PUBLISHED
 * products and visible categories are exposed, filters/sorts/pagination are
 * correct, availability follows the SS-112 aggregate, and nothing private
 * (storage keys, drafts, soft-deleted rows) leaks.
 */
describe('Public catalog API (SS-120/121/122) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const roleIds: Record<string, string> = {};
  const brandIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];
  const variantIds: string[] = [];
  const mediaIds: string[] = [];
  const warehouseIds: string[] = [];
  const inventoryItemIds: string[] = [];

  async function seedRole(name: string): Promise<string> {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) {
      return existing.id;
    }
    try {
      const created = await prisma.role.create({ data: { name } });
      return created.id;
    } catch {
      const row = await prisma.role.findUnique({ where: { name } });
      if (row) {
        return row.id;
      }
      throw new Error(`Failed to seed role ${name}`);
    }
  }

  beforeAll(async () => {
    // Uploaded fixture bytes are stored verbatim (no watermark) so media URLs
    // returned by the catalog can be verified end-to-end against SS-123.
    process.env.WATERMARK_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);

    for (const role of ['OPERATOR']) {
      roleIds[role] = await seedRole(role);
    }
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...mediaIds, ...productIds] } },
    });
    await prisma.productMedia.deleteMany({ where: { id: { in: mediaIds } } });
    await prisma.productMedia.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.inventoryItem.deleteMany({
      where: { id: { in: inventoryItemIds } },
    });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ entityId: { in: userIds } }, { userId: { in: userIds } }],
      },
    });
    await prisma.userSession.deleteMany({
      where: { user: { mobile: { in: mobiles } } },
    });
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  async function createOperator(): Promise<string> {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: { mobile, status: 'ACTIVE' },
    });
    userIds.push(user.id);
    await prisma.userRole.create({
      data: { userId: user.id, roleId: roleIds['OPERATOR']!, assignedBy: user.id },
    });
    await prisma.userProfile.create({
      data: { userId: user.id, firstName: 'علی', lastName: 'احمدی' },
    });
    const tokens = await tokenService.createSession(user.id);
    return tokens.accessToken;
  }

  interface SeedProductOptions {
    condition?: ProductCondition;
    withImage?: boolean;
    prices?: string[];
    onHand?: number;
    reserved?: number;
  }

  /**
   * Creates brand + category + product (+ optional variant(s), primary image,
   * stock in an ACTIVE warehouse) and leaves it in DRAFT; pass publish=true
   * through publishProduct for lifecycle-specific tests.
   */
  async function seedProduct(
    token: string,
    name: string,
    options: SeedProductOptions = {},
  ): Promise<{ productId: string; variantIds: string[]; mediaId: string | null }> {
    const suffix = `${uniqueSuffix()}`;
    const brand = await prisma.brand.create({
      data: { name: `برند ${suffix}`, slug: `brand-${suffix}` },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته ${suffix}`, slug: `cat-${suffix}` },
    });
    categoryIds.push(category.id);

    const product = await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name,
        brandId: brand.id,
        categoryId: category.id,
        condition: options.condition ?? ProductCondition.NEW,
      })
      .expect(201);
    productIds.push(product.body.id);

    const createdVariantIds: string[] = [];
    for (const price of options.prices ?? []) {
      const variant = await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${product.body.id}/variants`)
        .set('Authorization', `Bearer ${token}`)
        .send({ sku: `SKU-${suffix}-${Math.random()}`, price })
        .expect(201);
      variantIds.push(variant.body.id);
      createdVariantIds.push(variant.body.id);
    }

    let mediaId: string | null = null;
    if (options.withImage) {
      const media = await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${product.body.id}/media`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', jpegBuffer(), { filename: 'photo.jpg', contentType: 'image/jpeg' })
        .expect(201);
      mediaIds.push(media.body.id);
      mediaId = media.body.id;
    }

    if (options.prices?.length && (options.onHand ?? 0) > 0) {
      const warehouse = await prisma.warehouse.create({
        data: {
          code: `WH-${suffix}`,
          name: `انبار ${suffix}`,
          status: WarehouseStatus.ACTIVE,
        },
      });
      warehouseIds.push(warehouse.id);
      for (const variantId of createdVariantIds) {
        const item = await prisma.inventoryItem.create({
          data: {
            warehouseId: warehouse.id,
            variantId,
            quantityOnHand: options.onHand ?? 0,
            quantityReserved: options.reserved ?? 0,
          },
        });
        inventoryItemIds.push(item.id);
      }
    }

    return { productId: product.body.id, variantIds: createdVariantIds, mediaId };
  }

  async function publishProduct(
    token: string,
    productId: string,
    price = '1000.00',
  ): Promise<void> {
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/variants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: `SKU-${uniqueSuffix()}`, price })
      .expect(201);
    variantIds.push(variant.body.id);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  describe('SS-120: categories tree', () => {
    it('returns only visible categories with published-product counts', async () => {
      const token = await createOperator();
      const suffix = `${uniqueSuffix()}`;
      const parent = await prisma.category.create({
        data: { name: `والد ${suffix}`, slug: `parent-${suffix}`, isVisible: true },
      });
      categoryIds.push(parent.id);
      const hiddenChild = await prisma.category.create({
        data: {
          name: `مخفی ${suffix}`,
          slug: `hidden-${suffix}`,
          isVisible: false,
          parentId: parent.id,
        },
      });
      categoryIds.push(hiddenChild.id);

      const { productId } = await seedProduct(token, `محصول ${suffix}`);
      await prisma.product.update({
        where: { id: productId },
        data: { categoryId: hiddenChild.id },
      });
      // One published + one draft product in the visible parent.
      const draft = await prisma.product.create({
        data: {
          name: `پیش‌نویس ${suffix}`,
          slug: `draft-${suffix}`,
          brandId: brandIds[brandIds.length - 1]!,
          categoryId: parent.id,
          condition: ProductCondition.NEW,
          status: ProductStatus.DRAFT,
        },
      });
      productIds.push(draft.id);
      const published = await prisma.product.create({
        data: {
          name: `منتشرشده ${suffix}`,
          slug: `pub-${suffix}`,
          brandId: brandIds[brandIds.length - 1]!,
          categoryId: parent.id,
          condition: ProductCondition.NEW,
          status: ProductStatus.PUBLISHED,
        },
      });
      productIds.push(published.id);

      const res = await request(app.getHttpServer()).get(CATEGORIES_BASE).expect(200);
      const tree = res.body as Array<{
        id: string;
        publishedProductCount: number;
        children: Array<{ id: string }>;
      }>;
      const parentNode = tree.find((node) => node.id === parent.id);
      expect(parentNode).toBeDefined();
      expect(parentNode!.publishedProductCount).toBe(1);
      // The hidden child is not exposed anywhere in the tree.
      expect(JSON.stringify(tree)).not.toContain(hiddenChild.id);
    });

    it('rolls published counts up to visible ancestors', async () => {
      const token = await createOperator();
      const suffix = `${uniqueSuffix()}`;
      const parent = await prisma.category.create({
        data: { name: `والد ${suffix}`, slug: `parent-${suffix}`, isVisible: true },
      });
      categoryIds.push(parent.id);
      const child = await prisma.category.create({
        data: { name: `فرزند ${suffix}`, slug: `child-${suffix}`, parentId: parent.id },
      });
      categoryIds.push(child.id);

      const { productId } = await seedProduct(token, `شمارشی ${suffix}`);
      await prisma.product.update({
        where: { id: productId },
        data: { categoryId: child.id },
      });
      await publishProduct(token, productId);

      const res = await request(app.getHttpServer()).get(CATEGORIES_BASE).expect(200);
      const nodes = res.body as Array<{
        id: string;
        slug: string;
        publishedProductCount: number;
        children: Array<{ slug: string; publishedProductCount: number }>;
      }>;
      const parentNode = nodes.find((node) => node.id === parent.id);
      expect(parentNode!.publishedProductCount).toBe(1);
      expect(
        parentNode!.children.find((node) => node.slug === `child-${suffix}`)
          ?.publishedProductCount,
      ).toBe(1);
    });
  });

  describe('SS-120: brands list', () => {
    it('returns paginated brands without soft-deleted ones', async () => {
      const suffix = `${uniqueSuffix()}`;
      const brand = await prisma.brand.create({
        data: { name: `برندعمومی ${suffix}`, slug: `pubbrand-${suffix}` },
      });
      brandIds.push(brand.id);
      const deleted = await prisma.brand.create({
        data: { name: `حذف‌شده ${suffix}`, slug: `del-${suffix}`, deletedAt: new Date() },
      });
      brandIds.push(deleted.id);

      const res = await request(app.getHttpServer())
        .get(`${BRANDS_BASE}?page=1&limit=50`)
        .expect(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(50);
      expect(typeof res.body.total).toBe('number');
      const ids = res.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(brand.id);
      expect(ids).not.toContain(deleted.id);
      for (const item of res.body.items) {
        expect(Object.keys(item).sort()).toEqual(['id', 'name', 'slug']);
      }
    });

    it('validates pagination parameters with 400', async () => {
      await request(app.getHttpServer()).get(`${BRANDS_BASE}?page=0`).expect(400);
      await request(app.getHttpServer()).get(`${BRANDS_BASE}?limit=51`).expect(400);
      await request(app.getHttpServer()).get(`${BRANDS_BASE}?page=abc`).expect(400);
    });
  });

  describe('SS-121: product listing', () => {
    it('exposes only published products with priceFrom, image URL and availability', async () => {
      const token = await createOperator();
      const name = `لیستینگ ${uniqueSuffix()}`;
      const draft = await seedProduct(token, name, {
        prices: ['5000.00'],
        withImage: true,
      });
      await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(name)}`)
        .expect(200)
        .then((res) => expect(res.body.total).toBe(0));

      await publishProduct(token, draft.productId, '5000.00');

      const res = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(name)}`)
        .expect(200);
      expect(res.body.total).toBe(1);
      const card = res.body.items[0];
      expect(card.id).toBe(draft.productId);
      expect(card.name).toBe(name);
      expect(card.priceFrom).toBe('5000');
      expect(card.inStock).toBe(false);
      expect(card.primaryImageUrl).toBe(
        `/api/v1/catalog/media/${draft.mediaId}`,
      );
      expect(card.primaryThumbnailUrl).toBeNull();
      expect(Object.keys(card).sort()).toEqual([
        'brand',
        'callForPrice',
        'category',
        'condition',
        'id',
        'inStock',
        'name',
        'priceFrom',
        'primaryImageUrl',
        'primaryThumbnailUrl',
        'slug',
        'variantCount',
      ]);

      // The card URL must actually resolve through the SS-123 endpoint.
      await request(app.getHttpServer()).get(card.primaryImageUrl).expect(200);
    });

    it('reflects availability from the inventory aggregate only', async () => {
      const token = await createOperator();
      const name = `موجودی ${uniqueSuffix()}`;
      const { productId } = await seedProduct(token, name, {
        prices: ['1000.00'],
        onHand: 5,
        reserved: 2,
      });
      await publishProduct(token, productId);

      const res = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(name)}`)
        .expect(200);
      expect(res.body.items[0].inStock).toBe(true);

      // Fully reserved stock means unavailable (available = onHand − reserved).
      const item = await prisma.inventoryItem.findFirstOrThrow({
        where: { variant: { productId } },
      });
      inventoryItemIds.push(item.id);
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { quantityReserved: 5 },
      });
      await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(name)}`)
        .expect(200)
        .then((res) => expect(res.body.items[0].inStock).toBe(false));

      // An INACTIVE warehouse never contributes availability: move the only
      // stock to an inactive warehouse and the variant reads as unavailable.
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { quantityReserved: 0 },
      });
      const inactive = await prisma.warehouse.create({
        data: {
          code: `INACT-${uniqueSuffix()}`,
          name: 'انبار غیرفعال',
          status: WarehouseStatus.INACTIVE,
        },
      });
      warehouseIds.push(inactive.id);
      const inactiveItem = await prisma.inventoryItem.create({
        data: {
          warehouseId: inactive.id,
          variantId: item.variantId,
          quantityOnHand: 99,
        },
      });
      inventoryItemIds.push(inactiveItem.id);
      await prisma.inventoryItem.delete({ where: { id: item.id } });
      await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(name)}`)
        .expect(200)
        .then((res) => expect(res.body.items[0].inStock).toBe(false));
    });

    it('filters by category slug, brand slug and condition', async () => {
      const token = await createOperator();
      const name = `فیلتر ${uniqueSuffix()}`;
      const { productId } = await seedProduct(token, name, {
        condition: ProductCondition.USED,
        prices: ['100.00'],
      });
      await publishProduct(token, productId);
      const product = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: { category: { select: { slug: true } }, brand: { select: { slug: true } } },
      });

      const byCategory = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?category=${product.category.slug}`)
        .expect(200);
      expect(byCategory.body.items.map((c: { id: string }) => c.id)).toContain(
        productId,
      );

      const byBrand = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?brand=${product.brand!.slug}`)
        .expect(200);
      expect(byBrand.body.items.map((c: { id: string }) => c.id)).toContain(
        productId,
      );

      const byCondition = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?condition=USED&q=${encodeURIComponent(name)}`)
        .expect(200);
      expect(byCondition.body.total).toBe(1);

      const wrongCondition = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?condition=NEW&q=${encodeURIComponent(name)}`)
        .expect(200);
      expect(wrongCondition.body.total).toBe(0);
    });

    it('sorts by newest, name and minimum variant price', async () => {
      const token = await createOperator();
      const prefix = `سورت ${uniqueSuffix()}`;
      // Product A: variants 200 + 100 → priceFrom 100. Product B: 150 → 150.
      // ASCII markers keep the generated slugs unique (Persian is stripped).
      const a = await seedProduct(token, `${prefix}-a`, {
        prices: ['200.00', '100.00'],
      });
      const b = await seedProduct(token, `${prefix}-b`, { prices: ['150.00'] });
      await publishProduct(token, a.productId, '1000.00');
      await publishProduct(token, b.productId, '1000.00');

      const priceAsc = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(prefix)}&sort=price_asc`)
        .expect(200);
      const ascIds = priceAsc.body.items.map((c: { id: string }) => c.id);
      expect(ascIds).toEqual([a.productId, b.productId]);
      expect(priceAsc.body.items[0].priceFrom).toBe('100');

      const priceDesc = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(prefix)}&sort=price_desc`)
        .expect(200);
      expect(priceDesc.body.items.map((c: { id: string }) => c.id)).toEqual([
        b.productId,
        a.productId,
      ]);

      const nameAsc = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(prefix)}&sort=name`)
        .expect(200);
      expect(nameAsc.body.items.map((c: { id: string }) => c.id)).toEqual([
        a.productId,
        b.productId,
      ]);

      const newest = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(prefix)}`)
        .expect(200);
      expect(newest.body.items[0].id).toBe(b.productId);
    });

    it('paginates and validates parameters', async () => {
      const token = await createOperator();
      const prefix = `صفحه ${uniqueSuffix()}`;
      const first = await seedProduct(token, `${prefix}-a`, { prices: ['10.00'] });
      const second = await seedProduct(token, `${prefix}-b`, { prices: ['20.00'] });
      await publishProduct(token, first.productId);
      await publishProduct(token, second.productId);

      const page1 = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(prefix)}&limit=1&page=1`)
        .expect(200);
      expect(page1.body.total).toBe(2);
      expect(page1.body.items).toHaveLength(1);
      const page2 = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(prefix)}&limit=1&page=2`)
        .expect(200);
      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);

      await request(app.getHttpServer()).get(`${PRODUCTS_BASE}?sort=bogus`).expect(400);
      await request(app.getHttpServer()).get(`${PRODUCTS_BASE}?condition=NOPE`).expect(400);
      await request(app.getHttpServer()).get(`${PRODUCTS_BASE}?limit=0`).expect(400);
    });

    it('lists subtree products under a parent category slug', async () => {
      const token = await createOperator();
      const suffix = `${uniqueSuffix()}`;
      const parent = await prisma.category.create({
        data: { name: `والد ${suffix}`, slug: `parent-${suffix}`, isVisible: true },
      });
      categoryIds.push(parent.id);
      const child = await prisma.category.create({
        data: { name: `فرزند ${suffix}`, slug: `child-${suffix}`, parentId: parent.id },
      });
      categoryIds.push(child.id);

      const { productId } = await seedProduct(token, `فرزندانه ${suffix}`);
      await prisma.product.update({
        where: { id: productId },
        data: { categoryId: child.id },
      });
      await publishProduct(token, productId);

      const res = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?category=parent-${suffix}`)
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].id).toBe(productId);

      const missing = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?category=nope-${suffix}`)
        .expect(200);
      expect(missing.body.total).toBe(0);
    });
  });

  describe('SS-122: product detail', () => {
    it('returns the full detail DTO with breadcrumb, variants and ordered media', async () => {
      const token = await createOperator();
      const suffix = `${uniqueSuffix()}`;
      // Hidden grandparent is still part of the classification ancestry.
      const root = await prisma.category.create({
        data: { name: `ریشه ${suffix}`, slug: `root-${suffix}`, isVisible: false },
      });
      categoryIds.push(root.id);
      const leaf = await prisma.category.create({
        data: { name: `برگ ${suffix}`, slug: `leaf-${suffix}`, parentId: root.id },
      });
      categoryIds.push(leaf.id);

      const brand = await prisma.brand.create({
        data: { name: `برند ${suffix}`, slug: `b-${suffix}` },
      });
      brandIds.push(brand.id);

      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `جزئیات ${suffix}`,
          slug: `detail-${suffix}`,
          shortDescription: 'توضیح کوتاه',
          description: '<p>توضیح کامل</p>',
          brandId: brand.id,
          categoryId: leaf.id,
          condition: ProductCondition.NEW,
          warranty: '۱۸ ماه',
        })
        .expect(201);
      productIds.push(created.body.id);

      const media = await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${created.body.id}/media`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', jpegBuffer(), { filename: 'photo.jpg', contentType: 'image/jpeg' })
        .expect(201);
      mediaIds.push(media.body.id);
      const media2 = await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${created.body.id}/media`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', jpegBuffer(), { filename: 'photo2.jpg', contentType: 'image/jpeg' })
        .expect(201);
      mediaIds.push(media2.body.id);

      await publishProduct(token, created.body.id, '750.50');

      const res = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}/detail-${suffix}`)
        .expect(200);
      expect(res.body.slug).toBe(`detail-${suffix}`);
      expect(res.body.shortDescription).toBe('توضیح کوتاه');
      expect(res.body.description).toBe('<p>توضیح کامل</p>');
      expect(res.body.warranty).toBe('۱۸ ماه');
      expect(res.body.brand.slug).toBe(`b-${suffix}`);
      expect(res.body.category.slug).toBe(`leaf-${suffix}`);
      expect(res.body.categoryBreadcrumb).toEqual([
        { name: `ریشه ${suffix}`, slug: `root-${suffix}` },
        { name: `برگ ${suffix}`, slug: `leaf-${suffix}` },
      ]);
      expect(res.body.variants).toHaveLength(1);
      // Prisma Decimal serializes without a trailing zero.
      expect(res.body.variants[0].price).toBe('750.5');
      expect(res.body.inStock).toBe(false);
      // Primary image first in the media list.
      expect(res.body.media.map((m: { id: string }) => m.id)).toEqual([
        media.body.id,
        media2.body.id,
      ]);
      expect(res.body.media[0].url).toBe(`/api/v1/catalog/media/${media.body.id}`);
      expect(JSON.stringify(res.body)).not.toContain('storageKey');
    });

    it('returns 404 for unknown, draft, archived and soft-deleted slugs', async () => {
      const token = await createOperator();
      const suffix = `${uniqueSuffix()}`;

      await request(app.getHttpServer()).get(`${PRODUCTS_BASE}/nope-${suffix}`).expect(404);

      const { productId } = await seedProduct(token, `چهل‌چهار ${suffix}`, {
        prices: ['1.00'],
      });
      const row = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: { slug: true },
      });

      // DRAFT
      await request(app.getHttpServer()).get(`${PRODUCTS_BASE}/${row.slug}`).expect(404);

      await publishProduct(token, productId);
      await request(app.getHttpServer()).get(`${PRODUCTS_BASE}/${row.slug}`).expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${productId}/archive`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await request(app.getHttpServer()).get(`${PRODUCTS_BASE}/${row.slug}`).expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${productId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await request(app.getHttpServer()).get(`${PRODUCTS_BASE}/${row.slug}`).expect(404);
    });

    it('rejects malformed slugs with 400', async () => {
      await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}/${encodeURIComponent('Not A Slug!')}`)
        .expect(400);
    });

    it('exposes ordered specs on the detail DTO', async () => {
      const token = await createOperator();
      const suffix = `${uniqueSuffix()}`;
      const { productId } = await seedProduct(token, `مشخصه ${suffix}`, {
        prices: ['10.00'],
      });
      const specs = app.get(AttributesService);
      await specs.assignSpec(productId, {
        attributeName: `صفحه‌نمایش ${suffix}`,
        attributeSlug: `display-${suffix}`,
        value: '15.6 اینچ',
        valueSlug: '15-6-inch',
        sortOrder: 2,
        source: 'WOO_ATTR',
      });
      await specs.assignSpec(productId, {
        attributeName: `پردازنده ${suffix}`,
        attributeSlug: `cpu-${suffix}`,
        group: 'سخت‌افزار',
        value: 'Core i7',
        valueSlug: 'core-i7',
        sortOrder: 1,
        source: 'WOO_ATTR',
      });
      await publishProduct(token, productId);
      const row = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: { slug: true },
      });

      const res = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}/${row.slug}`)
        .expect(200);
      expect(res.body.specs.map((spec: { attributeName: string }) => spec.attributeName)).toEqual([
        `پردازنده ${suffix}`,
        `صفحه‌نمایش ${suffix}`,
      ]);
      expect(res.body.specs[0]).toMatchObject({
        attributeSlug: `cpu-${suffix}`,
        attributeGroup: 'سخت‌افزار',
        value: 'Core i7',
        valueSlug: 'core-i7',
        sortOrder: 1,
      });

      await prisma.productAttributeValue.deleteMany({
        where: { productId },
      });
      const attributeIds = (
        await prisma.attribute.findMany({
          where: { name: { in: [`پردازنده ${suffix}`, `صفحه‌نمایش ${suffix}`] } },
          select: { id: true },
        })
      ).map((attribute) => attribute.id);
      await prisma.attributeValue.deleteMany({
        where: { attributeId: { in: attributeIds } },
      });
      await prisma.attribute.deleteMany({
        where: { id: { in: attributeIds } },
      });
    });
  });

  describe('SS-201: sale and call-for-price pricing', () => {
    async function createProductWithSlug(
      token: string,
      slug: string,
    ): Promise<string> {
      const suffix = `${uniqueSuffix()}`;
      const brand = await prisma.brand.create({
        data: { name: `برند ${suffix}`, slug: `brand-${suffix}` },
      });
      brandIds.push(brand.id);
      const category = await prisma.category.create({
        data: { name: `دسته ${suffix}`, slug: `cat-${suffix}` },
      });
      categoryIds.push(category.id);

      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `قیمت ${suffix}`,
          slug,
          brandId: brand.id,
          categoryId: category.id,
          condition: ProductCondition.NEW,
        })
        .expect(201);
      productIds.push(created.body.id);
      return created.body.id as string;
    }

    it('exposes compareAtPrice on sale variants and validates pricing rules', async () => {
      const token = await createOperator();
      const slug = `sale-${uniqueSuffix()}`;
      const productId = await createProductWithSlug(token, slug);

      const sale = await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${productId}/variants`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          sku: `SKU-${uniqueSuffix()}`,
          price: '1500.00',
          compareAtPrice: '1800.00',
        })
        .expect(201);
      variantIds.push(sale.body.id);
      expect(sale.body.compareAtPrice).toBe('1800');
      expect(sale.body.priceStatus).toBe(PriceStatus.PRICED);

      // Reference at/below price is rejected…
      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${productId}/variants`)
        .set('Authorization', `Bearer ${token}`)
        .send({ sku: `SKU-${uniqueSuffix()}`, price: '1500.00', compareAtPrice: '1500.00' })
        .expect(400);

      // …as is a reference price on a call-for-price variant.
      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${productId}/variants`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          sku: `SKU-${uniqueSuffix()}`,
          price: '0',
          compareAtPrice: '1800.00',
          priceStatus: PriceStatus.CALL_FOR_PRICE,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${productId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const detail = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}/${slug}`)
        .expect(200);
      expect(detail.body.variants).toHaveLength(1);
      expect(detail.body.variants[0].compareAtPrice).toBe('1800');
      expect(detail.body.variants[0].priceStatus).toBe(PriceStatus.PRICED);

      const card = (
        await request(app.getHttpServer())
          .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(slug)}`)
          .expect(200)
      ).body.items[0];
      expect(card.priceFrom).toBe('1500');
      expect(card.callForPrice).toBe(false);
      expect(card.variantCount).toBe(1);
    });

    it('marks priceless products call-for-price with empty priceFrom', async () => {
      const token = await createOperator();
      const slug = `cfp-${uniqueSuffix()}`;
      const productId = await createProductWithSlug(token, slug);

      const variant = await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${productId}/variants`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          sku: `SKU-${uniqueSuffix()}`,
          price: '0',
          priceStatus: PriceStatus.CALL_FOR_PRICE,
        })
        .expect(201);
      variantIds.push(variant.body.id);

      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${productId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const card = (
        await request(app.getHttpServer())
          .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(slug)}`)
          .expect(200)
      ).body.items[0];
      expect(card.priceFrom).toBe('');
      expect(card.callForPrice).toBe(true);
      expect(card.variantCount).toBe(1);

      const detail = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}/${slug}`)
        .expect(200);
      expect(detail.body.variants[0].priceStatus).toBe(PriceStatus.CALL_FOR_PRICE);
    });
  });

  describe('SS-203: tags and metadata on the detail DTO', () => {
    it('exposes ordered tags', async () => {
      const token = await createOperator();
      const suffix = `${uniqueSuffix()}`;
      const brand = await prisma.brand.create({
        data: { name: `برند ${suffix}`, slug: `brand-${suffix}` },
      });
      brandIds.push(brand.id);
      const category = await prisma.category.create({
        data: { name: `دسته ${suffix}`, slug: `cat-${suffix}` },
      });
      categoryIds.push(category.id);

      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `برچسب ${suffix}`,
          slug: `tagged-${suffix}`,
          brandId: brand.id,
          categoryId: category.id,
          condition: ProductCondition.NEW,
        })
        .expect(201);
      productIds.push(created.body.id);

      const tagService = app.get(TagsService);
      await tagService.assignTag(created.body.id, 'گیمینگ', `gaming-${suffix}`, 2);
      await tagService.assignTag(created.body.id, 'لپ تاپ', `laptop-${suffix}`, 1);
      await publishProduct(token, created.body.id);

      const res = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}/tagged-${suffix}`)
        .expect(200);
      expect(res.body.tags).toEqual([
        { name: 'لپ تاپ', slug: `laptop-${suffix}` },
        { name: 'گیمینگ', slug: `gaming-${suffix}` },
      ]);

      await prisma.productTag.deleteMany({
        where: { productId: created.body.id },
      });
      const tagIds = (
        await prisma.tag.findMany({
          where: { slug: { in: [`gaming-${suffix}`, `laptop-${suffix}`] } },
          select: { id: true },
        })
      ).map((tag) => tag.id);
      await prisma.tag.deleteMany({ where: { id: { in: tagIds } } });
    });
  });

  describe('SS-214: variant options, media variantId, and related products', () => {
    async function createPublishedProduct(
      token: string,
      opts: {
        name: string;
        slug: string;
        brandId: string;
        categoryId: string;
        price?: string;
        publish?: boolean;
      },
    ): Promise<string> {
      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: opts.name,
          slug: opts.slug,
          brandId: opts.brandId,
          categoryId: opts.categoryId,
          condition: ProductCondition.NEW,
        })
        .expect(201);
      productIds.push(created.body.id);
      const variant = await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${created.body.id}/variants`)
        .set('Authorization', `Bearer ${token}`)
        .send({ sku: `SKU-${uniqueSuffix()}`, price: opts.price ?? '100.00' })
        .expect(201);
      variantIds.push(variant.body.id);
      if (opts.publish !== false) {
        await request(app.getHttpServer())
          .post(`/api/v1/admin/products/${created.body.id}/publish`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }
      return created.body.id as string;
    }

    async function cleanupAttributes(names: string[]): Promise<void> {
      const attributeIds = (
        await prisma.attribute.findMany({
          where: { name: { in: names } },
          select: { id: true },
        })
      ).map((attribute) => attribute.id);
      await prisma.variantAttributeValue.deleteMany({
        where: { attributeValue: { attributeId: { in: attributeIds } } },
      });
      await prisma.attributeValue.deleteMany({
        where: { attributeId: { in: attributeIds } },
      });
      await prisma.attribute.deleteMany({
        where: { id: { in: attributeIds } },
      });
    }

    it('exposes ordered variant options and [] for option-less variants', async () => {
      const token = await createOperator();
      const suffix = `${uniqueSuffix()}`;
      const { productId, variantIds: vIds } = await seedProduct(
        token,
        `گزینه ${suffix}`,
        { prices: ['10.00', '20.00'] },
      );
      const attrs = app.get(AttributesService);
      await attrs.setVariantOption(vIds[0]!, {
        attributeName: 'Memory',
        attributeSlug: `memory-${suffix}`,
        value: '256GB',
        valueSlug: '256gb',
      });
      await attrs.setVariantOption(vIds[0]!, {
        attributeName: 'Color',
        attributeSlug: `color-${suffix}`,
        value: 'White',
        valueSlug: 'white',
      });
      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${productId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const row = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: { slug: true },
      });

      const res = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}/${row.slug}`)
        .expect(200);
      expect(res.body.variants).toHaveLength(2);
      const withOptions = res.body.variants.find(
        (variant: { id: string }) => variant.id === vIds[0],
      );
      // Deterministic ordering: attribute name, then value.
      expect(withOptions.options).toEqual([
        {
          attributeName: 'Color',
          attributeSlug: `color-${suffix}`,
          value: 'White',
          valueSlug: 'white',
        },
        {
          attributeName: 'Memory',
          attributeSlug: `memory-${suffix}`,
          value: '256GB',
          valueSlug: '256gb',
        },
      ]);
      const withoutOptions = res.body.variants.find(
        (variant: { id: string }) => variant.id === vIds[1],
      );
      expect(withoutOptions.options).toEqual([]);

      await cleanupAttributes(['Color', 'Memory']);
    });

    it('exposes media variantId for variant-scoped media and null otherwise', async () => {
      const token = await createOperator();
      const suffix = `${uniqueSuffix()}`;
      const { productId, variantIds: vIds } = await seedProduct(
        token,
        `رسانه ${suffix}`,
        { prices: ['10.00'] },
      );
      const productMedia = await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${productId}/media`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', jpegBuffer(), {
          filename: 'product.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);
      mediaIds.push(productMedia.body.id);
      const variantMedia = await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${productId}/media`)
        .set('Authorization', `Bearer ${token}`)
        .field('variantId', vIds[0]!)
        .attach('file', jpegBuffer(), {
          filename: 'variant.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);
      mediaIds.push(variantMedia.body.id);
      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${productId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const row = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: { slug: true },
      });

      const res = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}/${row.slug}`)
        .expect(200);
      const byId = new Map(
        res.body.media.map((item: { id: string; variantId: string | null }) => [
          item.id,
          item.variantId,
        ]),
      );
      expect(byId.get(productMedia.body.id)).toBeNull();
      expect(byId.get(variantMedia.body.id)).toBe(vIds[0]);
    });

    it('returns brand-preferred same-leaf related cards, bounded and exclusive', async () => {
      const token = await createOperator();
      const suffix = `${uniqueSuffix()}`;
      const leaf = await prisma.category.create({
        data: { name: `برگ ${suffix}`, slug: `leaf-${suffix}` },
      });
      categoryIds.push(leaf.id);
      const otherCategory = await prisma.category.create({
        data: { name: `سایر ${suffix}`, slug: `other-${suffix}` },
      });
      categoryIds.push(otherCategory.id);
      const brandA = await prisma.brand.create({
        data: { name: `آلفا ${suffix}`, slug: `brand-a-${suffix}` },
      });
      brandIds.push(brandA.id);
      const brandB = await prisma.brand.create({
        data: { name: `بتا ${suffix}`, slug: `brand-b-${suffix}` },
      });
      brandIds.push(brandB.id);

      const mainSlug = `main-${suffix}`;
      const mainId = await createPublishedProduct(token, {
        name: `اصلی ${suffix}`,
        slug: mainSlug,
        brandId: brandA.id,
        categoryId: leaf.id,
      });
      const sameBrandLeaf = await createPublishedProduct(token, {
        name: `هم‌برند ${suffix}`,
        slug: `same-brand-${suffix}`,
        brandId: brandA.id,
        categoryId: leaf.id,
      });
      const otherBrandLeaf = await createPublishedProduct(token, {
        name: `برند-دیگر ${suffix}`,
        slug: `other-brand-${suffix}`,
        brandId: brandB.id,
        categoryId: leaf.id,
      });
      // Draft rows in the same leaf must never leak into related.
      await createPublishedProduct(token, {
        name: `پیشنویس ${suffix}`,
        slug: `draft-${suffix}`,
        brandId: brandA.id,
        categoryId: leaf.id,
        publish: false,
      });
      const deletedId = await createPublishedProduct(token, {
        name: `حذفی ${suffix}`,
        slug: `deleted-${suffix}`,
        brandId: brandA.id,
        categoryId: leaf.id,
      });
      // Soft-delete requires ARCHIVED status first (domain lifecycle rule).
      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${deletedId}/archive`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${deletedId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      // Same brand in another category: not needed here (the leaf already
      // yields enough rows), so it stays out of this response.
      await createPublishedProduct(token, {
        name: `دور ${suffix}`,
        slug: `far-${suffix}`,
        brandId: brandA.id,
        categoryId: otherCategory.id,
      });

      const res = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}/${mainSlug}`)
        .expect(200);
      const related = res.body.related as Array<{
        id: string;
        slug: string;
        brand: { slug: string } | null;
        priceFrom: string;
      }>;
      const relatedIds = related.map((item) => item.id);
      // Current product excluded, no duplicates, bounded.
      expect(relatedIds).not.toContain(mainId);
      expect(new Set(relatedIds).size).toBe(relatedIds.length);
      expect(related.length).toBeLessThanOrEqual(8);
      expect(relatedIds).toContain(sameBrandLeaf);
      expect(relatedIds).toContain(otherBrandLeaf);
      expect(relatedIds).not.toContain(deletedId);
      // Same-brand rows rank before other-brand rows.
      expect(relatedIds.indexOf(sameBrandLeaf)).toBeLessThan(
        relatedIds.indexOf(otherBrandLeaf),
      );
      // Card projection carries listing truth (price/media hydration).
      for (const item of related) {
        expect(typeof item.slug).toBe('string');
        expect(typeof item.priceFrom).toBe('string');
      }
    });

    it('backfills same-brand products from other categories when the leaf is thin', async () => {
      const token = await createOperator();
      const suffix = `${uniqueSuffix()}-b`;
      const leaf = await prisma.category.create({
        data: { name: `برگ ${suffix}`, slug: `leaf-${suffix}` },
      });
      categoryIds.push(leaf.id);
      const elsewhere = await prisma.category.create({
        data: { name: `جای دیگر ${suffix}`, slug: `elsewhere-${suffix}` },
      });
      categoryIds.push(elsewhere.id);
      const brand = await prisma.brand.create({
        data: { name: `گاما ${suffix}`, slug: `brand-g-${suffix}` },
      });
      brandIds.push(brand.id);

      const mainSlug = `thin-${suffix}`;
      const mainId = await createPublishedProduct(token, {
        name: `تک ${suffix}`,
        slug: mainSlug,
        brandId: brand.id,
        categoryId: leaf.id,
      });
      const backfillId = await createPublishedProduct(token, {
        name: `هم‌برند دور ${suffix}`,
        slug: `backfill-${suffix}`,
        brandId: brand.id,
        categoryId: elsewhere.id,
      });

      const res = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}/${mainSlug}`)
        .expect(200);
      const relatedIds = (res.body.related as Array<{ id: string }>).map(
        (item) => item.id,
      );
      expect(relatedIds).toContain(backfillId);
      expect(relatedIds).not.toContain(mainId);
    });

    it('returns an empty related list when nothing else is published', async () => {
      const token = await createOperator();
      const suffix = `${uniqueSuffix()}-solo`;
      const leaf = await prisma.category.create({
        data: { name: `تنها ${suffix}`, slug: `solo-${suffix}` },
      });
      categoryIds.push(leaf.id);
      const brand = await prisma.brand.create({
        data: { name: `سولو ${suffix}`, slug: `solo-brand-${suffix}` },
      });
      brandIds.push(brand.id);
      const slug = `solo-${suffix}`;
      await createPublishedProduct(token, {
        name: `تنها ${suffix}`,
        slug,
        brandId: brand.id,
        categoryId: leaf.id,
      });

      const res = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}/${slug}`)
        .expect(200);
      expect(res.body.related).toEqual([]);
      expect(res.body.variants[0].options).toEqual([]);
    });
  });

  describe('SS-216: Persian Postgres search', () => {
    it('matches ZWNJ/space compound variants and Arabic letter forms', async () => {
      const token = await createOperator();
      const suffix = uniqueSuffix();
      const created = await seedProduct(token, `کیبورد مکانیکال ${suffix}`, {
        prices: ['10.00'],
      });
      await publishProduct(token, created.productId);

      // Plain form finds the product…
      const plain = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(`کیبورد ${suffix}`)}`)
        .expect(200);
      expect(plain.body.items.map((c: { id: string }) => c.id)).toContain(
        created.productId,
      );

      // …so does the Arabic kaf (ك) spelling of the same query.
      const arabicKaf = await request(app.getHttpServer())
        .get(
          `${PRODUCTS_BASE}?q=${encodeURIComponent(`\u0643\u06cc\u0628\u0648\u0631\u062f ${suffix}`)}`,
        )
        .expect(200);
      expect(
        arabicKaf.body.items.map((c: { id: string }) => c.id),
      ).toContain(created.productId);
    });

    it('finds published products by exact SKU', async () => {
      const token = await createOperator();
      const created = await seedProduct(token, `کدآزون ${uniqueSuffix()}`, {
        prices: ['10.00'],
      });
      await publishProduct(token, created.productId);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: created.variantIds[0] ?? '' },
        select: { sku: true },
      });

      const res = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(variant.sku)}`)
        .expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body.items[0].id).toBe(created.productId);
    });

    it('accepts a 64-grapheme emoji query and rejects 65 graphemes', async () => {
      await createOperator();
      const emoji = '🖱️';
      // 64 graphemes = 192 UTF-16 code units: rejected by the old
      // code-unit cap, accepted by the grapheme-aware SS-216 policy.
      const ok = await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(emoji.repeat(64))}`)
        .expect(200);
      expect(ok.body.items).toEqual([]);

      await request(app.getHttpServer())
        .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(emoji.repeat(65))}`)
        .expect(400);
    });
  });
});
