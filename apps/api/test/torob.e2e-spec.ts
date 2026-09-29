import { INestApplication } from '@nestjs/common';
import { generateKeyPairSync, sign } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PriceStatus,
  ProductCondition,
  ProductStatus,
  ProductMediaType,
  WarehouseStatus,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';

jest.setTimeout(60_000);

const TOROB_BASE = '/api/v1/torob';
const AUDIENCE = 'torob-test.example';
const STOREFRONT_BASE = 'https://storefront.example';
const API_BASE = 'https://api.example';

/** Ed25519 keypair generated per run — mirrors Torob's key distribution. */
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function torobToken(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = { exp: now + 60, nbf: now - 60, aud: AUDIENCE, ...overrides };
  const head = b64url({ alg: 'EdDSA', typ: 'JWT' });
  const body = b64url(payload);
  const signature = sign(null, Buffer.from(`${head}.${body}`), privateKey).toString(
    'base64url',
  );
  return `${head}.${body}.${signature}`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Torob product feed (SS-239). Proves the storefront-facing contract Torob
 * crawls: only PUBLISHED products with PRICED variants appear, money leaves
 * as Toman integers (Rial ÷10), availability follows the inventory truth,
 * URLs are absolute, auth failures are the bare 401, and malformed bodies
 * keep the spec's `{error}` envelope on 400.
 */
describe('Torob feed API (SS-239) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const categoryIds: string[] = [];
  const productIds: string[] = [];
  const variantIds: string[] = [];
  const mediaIds: string[] = [];
  const warehouseIds: string[] = [];
  const inventoryItemIds: string[] = [];

  let pricedSlug: string;
  let pricedProductId: string;
  let pricedMediaId: string;
  let callForPriceSlug: string;
  let draftSlug: string;

  beforeAll(async () => {
    process.env.TOROB_JWT_AUDIENCE = AUDIENCE;
    process.env.TOROB_JWT_PUBLIC_KEY_PEM = PUBLIC_PEM;
    process.env.TOROB_FEED_STOREFRONT_BASE_URL = STOREFRONT_BASE;
    process.env.TOROB_FEED_API_BASE_URL = API_BASE;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await seedCatalog();
  });

  async function seedCatalog(): Promise<void> {
    const category = await prisma.category.create({
      data: { name: 'کالای دیجیتال ترب', slug: `torob-cat-${uniqueSuffix()}` },
    });
    categoryIds.push(category.id);

    const warehouse = await prisma.warehouse.create({
      data: {
        code: `TOROB-${uniqueSuffix()}`,
        name: 'انبار ترب',
        status: WarehouseStatus.ACTIVE,
      },
    });
    warehouseIds.push(warehouse.id);

    // The feedable product: published, two PRICED variants, one image, stock
    // on variant 1 only.
    pricedSlug = `torob-priced-${uniqueSuffix()}`;
    const priced = await prisma.product.create({
      data: {
        name: 'گوشی موبایل ترب',
        slug: pricedSlug,
        categoryId: category.id,
        status: ProductStatus.PUBLISHED,
        condition: ProductCondition.NEW,
        subtitle: 'نسخه ۱۲۸ گیگابایت',
        shortDescription: 'توضیح کوتاه ترب',
        warranty: '۱۸ ماه گارانتی',
        variants: {
          create: [
            {
              sku: `TOROB-A-${uniqueSuffix()}`,
              price: '1234567',
              compareAtPrice: '1500000',
              priceStatus: PriceStatus.PRICED,
            },
            {
              sku: `TOROB-B-${uniqueSuffix()}`,
              price: '2000000',
              compareAtPrice: '2500000',
              priceStatus: PriceStatus.PRICED,
            },
          ],
        },
      },
      include: { variants: true },
    });
    productIds.push(priced.id);
    pricedProductId = priced.id;

    // Deterministic date_updated for the row-key pin below (createdAt stays
    // the creation time; a raw update pins updatedAt to a fixed value).
    await prisma.$executeRaw`UPDATE "Product" SET "updatedAt" = ${new Date(
      '2026-01-02T00:00:00.000Z',
    )} WHERE "id" = ${priced.id}`;

    for (const variant of priced.variants) {
      variantIds.push(variant.id);
      const item = await prisma.inventoryItem.create({
        data: {
          warehouseId: warehouse.id,
          variantId: variant.id,
          quantityOnHand: variant.price.toNumber() === 1234567 ? 5 : 0,
          quantityReserved: 0,
        },
      });
      inventoryItemIds.push(item.id);
    }

    const media = await prisma.productMedia.create({
      data: {
        productId: priced.id,
        mediaType: ProductMediaType.IMAGE,
        originalName: 'torob.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 12,
        storageKey: `torob/${uniqueSuffix()}.jpg`,
        isPrimary: true,
        sortOrder: 0,
      },
    });
    mediaIds.push(media.id);
    pricedMediaId = media.id;

    // Published but CALL_FOR_PRICE-only: no priced offer, must never appear.
    callForPriceSlug = `torob-cfp-${uniqueSuffix()}`;
    const callForPrice = await prisma.product.create({
      data: {
        name: 'محصول تماس',
        slug: callForPriceSlug,
        categoryId: category.id,
        status: ProductStatus.PUBLISHED,
        condition: ProductCondition.NEW,
        variants: {
          create: {
            sku: `TOROB-CFP-${uniqueSuffix()}`,
            price: '0',
            priceStatus: PriceStatus.CALL_FOR_PRICE,
          },
        },
      },
    });
    productIds.push(callForPrice.id);

    // DRAFT: never public, never in the feed.
    draftSlug = `torob-draft-${uniqueSuffix()}`;
    const draft = await prisma.product.create({
      data: {
        name: 'پیش‌نویس ترب',
        slug: draftSlug,
        categoryId: category.id,
        status: ProductStatus.DRAFT,
        condition: ProductCondition.NEW,
      },
    });
    productIds.push(draft.id);
  }

  afterAll(async () => {
    await prisma.inventoryItem.deleteMany({
      where: { id: { in: inventoryItemIds } },
    });
    await prisma.productMedia.deleteMany({ where: { id: { in: mediaIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await app.close();
  });

  describe('authentication', () => {
    it('rejects a missing token with a bare 401', async () => {
      const response = await request(app.getHttpServer())
        .post(`${TOROB_BASE}/products`)
        .send({ page: 1, sort: 'date_added_desc' });
      expect(response.status).toBe(401);
      expect(Object.keys(response.body).sort()).toEqual(['error']);
    });

    it('rejects a token signed with a foreign key', async () => {
      const other = generateKeyPairSync('ed25519');
      const head = b64url({ alg: 'EdDSA', typ: 'JWT' });
      const body = b64url({
        exp: Math.floor(Date.now() / 1000) + 60,
        nbf: Math.floor(Date.now() / 1000) - 60,
        aud: AUDIENCE,
      });
      const forged = sign(null, Buffer.from(`${head}.${body}`), other.privateKey);
      const response = await request(app.getHttpServer())
        .post(`${TOROB_BASE}/products`)
        .set('Authorization', `Bearer ${head}.${body}.${forged.toString('base64url')}`)
        .send({ page: 1, sort: 'date_added_desc' });
      expect(response.status).toBe(401);
    });

    it('rejects an expired token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const response = await request(app.getHttpServer())
        .post(`${TOROB_BASE}/products`)
        .set(
          'Authorization',
          `Bearer ${torobToken({ exp: now - 10, nbf: now - 60 })}`,
        )
        .send({ page: 1, sort: 'date_added_desc' });
      expect(response.status).toBe(401);
    });

    it('rejects a token for the wrong audience', async () => {
      const response = await request(app.getHttpServer())
        .post(`${TOROB_BASE}/products`)
        .set('Authorization', `Bearer ${torobToken({ aud: 'other.example' })}`)
        .send({ page: 1, sort: 'date_added_desc' });
      expect(response.status).toBe(401);
    });
  });

  describe('request validation', () => {
    it('rejects a missing sort with the spec error envelope', async () => {
      const response = await request(app.getHttpServer())
        .post(`${TOROB_BASE}/products`)
        .set('Authorization', `Bearer ${torobToken()}`)
        .send({ page: 1 });
      expect(response.status).toBe(400);
      expect(Object.keys(response.body).sort()).toEqual(['error']);
      expect(typeof response.body.error).toBe('string');
    });

    it('rejects a body mixing two request shapes', async () => {
      const response = await request(app.getHttpServer())
        .post(`${TOROB_BASE}/products`)
        .set('Authorization', `Bearer ${torobToken()}`)
        .send({ page: 1, cursor: 'abc', sort: 'date_added_desc' });
      expect(response.status).toBe(400);
      expect(Object.keys(response.body).sort()).toEqual(['error']);
    });

    it('rejects an empty body', async () => {
      const response = await request(app.getHttpServer())
        .post(`${TOROB_BASE}/products`)
        .set('Authorization', `Bearer ${torobToken()}`)
        .send({});
      expect(response.status).toBe(400);
    });
  });

  describe('feed content', () => {
    it('serves the page-mode feed with the exact v3 envelope and row keys', async () => {
      const response = await request(app.getHttpServer())
        .post(`${TOROB_BASE}/products`)
        .set('Authorization', `Bearer ${torobToken()}`)
        .send({ page: 1, sort: 'date_added_desc' })
        .expect(200);

      expect(Object.keys(response.body).sort()).toEqual(
        [
          'api_version',
          'current_page',
          'max_pages',
          'next_cursor',
          'products',
          'total',
        ].sort(),
      );
      expect(response.body.api_version).toBe('torob_api_v3');
      expect(response.body.current_page).toBe(1);
      expect(response.body.total).toBeGreaterThanOrEqual(1);
      expect(response.body.max_pages).toBeGreaterThanOrEqual(1);
      expect(response.body.next_cursor).toBeNull();

      const row = response.body.products.find(
        (item: { page_unique: string }) => item.page_unique === pricedSlug,
      );
      expect(row).toBeDefined();
      expect(Object.keys(row).sort()).toEqual(
        [
          'availability',
          'category_name',
          'current_price',
          'date_added',
          'date_updated',
          'guarantee',
          'image_links',
          'old_price',
          'page_unique',
          'page_url',
          'product_group_id',
          'short_desc',
          'spec',
          'subtitle',
          'title',
        ].sort(),
      );
      expect(row.page_url).toBe(`${STOREFRONT_BASE}/products/${pricedSlug}`);
      expect(row.product_group_id).toBe(pricedProductId);
      expect(row.title).toBe('گوشی موبایل ترب');
      expect(row.subtitle).toBe('نسخه ۱۲۸ گیگابایت');
      expect(row.category_name).toBe('کالای دیجیتال ترب');
      expect(row.guarantee).toBe('۱۸ ماه گارانتی');
      expect(row.short_desc).toBe('توضیح کوتاه ترب');

      // One row per PRICED variant of the group; this group has two.
      const groupRows = response.body.products.filter(
        (item: { product_group_id: string }) =>
          item.product_group_id === pricedProductId,
      );
      expect(groupRows).toHaveLength(2);

      // Row-level money and availability: variant without stock is unavailable,
      // compareAt only on variant 2.
      const stocked = groupRows.find(
        (item: { current_price: number }) => item.current_price === 123456,
      );
      expect(stocked).toBeDefined();
      expect(stocked.availability).toBe(true);
      expect(stocked.old_price).toBe(150000);
      expect(stocked.image_links).toEqual([
        `${API_BASE}/api/v1/catalog/media/${pricedMediaId}`,
      ]);
      expect(new Date(stocked.date_added).toString()).not.toBe('Invalid Date');

      const discounted = groupRows.find(
        (item: { current_price: number }) => item.current_price === 200000,
      );
      expect(discounted).toBeDefined();
      expect(discounted.availability).toBe(false);
      expect(discounted.old_price).toBe(250000);
    });

    it('never lists CALL_FOR_PRICE-only or draft products', async () => {
      // Lookup mode targets the excluded products directly, so the assertion
      // is meaningful regardless of how deep in the catalog they sort.
      const response = await request(app.getHttpServer())
        .post(`${TOROB_BASE}/products`)
        .set('Authorization', `Bearer ${torobToken()}`)
        .send({ page_uniques: [callForPriceSlug, draftSlug] })
        .expect(200);

      expect(response.body.total).toBe(0);
      expect(response.body.products).toEqual([]);
    });

    it('resolves page_urls back to feed rows and ignores foreign URLs', async () => {
      const response = await request(app.getHttpServer())
        .post(`${TOROB_BASE}/products`)
        .set('Authorization', `Bearer ${torobToken()}`)
        .send({
          page_urls: [
            `${STOREFRONT_BASE}/products/${pricedSlug}?utm=torob`,
            'https://elsewhere.example/products/not-ours',
          ],
        })
        .expect(200);

      expect(response.body.total).toBe(1);
      // One row per PRICED variant — the group has two, both for the slug.
      const urlUniques = response.body.products.map(
        (item: { page_unique: string }) => item.page_unique,
      );
      expect(urlUniques).toHaveLength(2);
      expect(new Set(urlUniques)).toEqual(new Set([pricedSlug]));
    });

    it('resolves page_uniques (slugs) to feed rows', async () => {
      const response = await request(app.getHttpServer())
        .post(`${TOROB_BASE}/products`)
        .set('Authorization', `Bearer ${torobToken()}`)
        .send({ page_uniques: [pricedSlug] })
        .expect(200);

      expect(response.body.total).toBe(1);
      const uniqueRows = response.body.products.map(
        (item: { page_unique: string }) => item.page_unique,
      );
      expect(uniqueRows).toHaveLength(2);
      expect(new Set(uniqueRows)).toEqual(new Set([pricedSlug]));
    });

    it('serves cursor mode and treats an invalid cursor as a fresh sweep', async () => {
      const fresh = await request(app.getHttpServer())
        .post(`${TOROB_BASE}/products`)
        .set('Authorization', `Bearer ${torobToken()}`)
        .send({ cursor: '%%%not-base64%%%', sort: 'date_added_desc' })
        .expect(200);

      expect(fresh.body.api_version).toBe('torob_api_v3');
      expect(fresh.body.total).toBeNull();
      expect(fresh.body.max_pages).toBeNull();
      // A sweep ends immediately on a small catalog, or hands back a cursor
      // when more than one page of products exists.
      expect(['string', 'object']).toContain(typeof fresh.body.next_cursor);
      expect(
        fresh.body.products.some(
          (item: { page_unique: string }) => item.page_unique === pricedSlug,
        ),
      ).toBe(true);
    });
  });
});
