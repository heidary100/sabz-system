import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const PRODUCTS_BASE = '/api/v1/admin/products';
const PUBLIC_MEDIA_BASE = '/api/v1/catalog/media';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
}

/**
 * Public catalog media serving (SS-123). The endpoint is intentionally
 * unauthenticated: the suite proves that ONLY media of published, non-deleted
 * products is reachable, and that nothing about storage internals leaks.
 */
describe('Public catalog media API (SS-123) (e2e)', () => {
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
    // This suite exercises the public HTTP contract, not the watermark
    // pipeline (covered elsewhere). Watermarking is disabled so uploaded
    // fixture bytes are stored verbatim and can be compared exactly.
    process.env.WATERMARK_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);

    for (const role of ['CUSTOMER', 'OPERATOR', 'ADMIN']) {
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
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
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

  async function createOperator() {
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

  async function createProductWithMedia(token: string): Promise<string> {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${Date.now()}-${Math.random()}`,
        slug: `brand-${Date.now()}-${Math.random()}`,
      },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}-${Math.random()}`,
        slug: `cat-${Date.now()}-${Math.random()}`,
      },
    });
    categoryIds.push(category.id);

    const product = await request(app.getHttpServer())
      .post(PRODUCTS_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `محصول ${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
      })
      .expect(201);
    productIds.push(product.body.id);

    const media = await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${product.body.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', jpegBuffer(), { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);
    mediaIds.push(media.body.id);

    return product.body.id;
  }

  async function publish(productId: string, token: string): Promise<void> {
    const variant = await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${productId}/variants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: `SKU-${Date.now()}-${Math.random()}`, price: '1000.00' })
      .expect(201);
    variantIds.push(variant.body.id);
    await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${productId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  it('serves media of a published product publicly with immutable caching and no storage internals', async () => {
    const token = await createOperator();
    const productId = await createProductWithMedia(token);
    await publish(productId, token);
    const mediaId = mediaIds[mediaIds.length - 1]!;

    // No Authorization header at all: the endpoint is public by contract.
    const res = await request(app.getHttpServer())
      .get(`${PUBLIC_MEDIA_BASE}/${mediaId}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(Number(res.headers['content-length'])).toBe(jpegBuffer().length);
    expect(Buffer.from(res.body).equals(jpegBuffer())).toBe(true);
    expect(JSON.stringify(res.headers)).not.toContain('storageKey');
    expect(res.text ?? '').not.toContain('products/');
  });

  it('returns 404 for the media of a DRAFT product, then 200 once it is published', async () => {
    const token = await createOperator();
    const productId = await createProductWithMedia(token);
    const mediaId = mediaIds[mediaIds.length - 1]!;

    await request(app.getHttpServer()).get(`${PUBLIC_MEDIA_BASE}/${mediaId}`).expect(404);

    await publish(productId, token);
    await request(app.getHttpServer()).get(`${PUBLIC_MEDIA_BASE}/${mediaId}`).expect(200);
  });

  it('returns 404 for the media of an ARCHIVED product', async () => {
    const token = await createOperator();
    const productId = await createProductWithMedia(token);
    await publish(productId, token);
    const mediaId = mediaIds[mediaIds.length - 1]!;

    await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${productId}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer()).get(`${PUBLIC_MEDIA_BASE}/${mediaId}`).expect(404);
  });

  it('returns 404 for soft-deleted media of a published product', async () => {
    const token = await createOperator();
    const productId = await createProductWithMedia(token);
    await publish(productId, token);
    const mediaId = mediaIds[mediaIds.length - 1]!;

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/media/${mediaId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer()).get(`${PUBLIC_MEDIA_BASE}/${mediaId}`).expect(404);
  });

  it('returns 404 for the media of a soft-deleted published product', async () => {
    const token = await createOperator();
    const productId = await createProductWithMedia(token);
    await publish(productId, token);
    const mediaId = mediaIds[mediaIds.length - 1]!;

    // A PUBLISHED product cannot be deleted directly (409 by design); the
    // lifecycle is archive first, then delete.
    await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${productId}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`${PRODUCTS_BASE}/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer()).get(`${PUBLIC_MEDIA_BASE}/${mediaId}`).expect(404);
  });

  it('returns 404 for variant-scoped media whose variant was soft-deleted', async () => {
    const token = await createOperator();
    const productId = await createProductWithMedia(token);
    const mediaId = mediaIds[mediaIds.length - 1]!;
    await publish(productId, token);

    // Attach a variant-scoped media to the published product, verify it is
    // publicly served, then soft-delete the variant: the media must vanish
    // from the public catalog with the variant.
    const variant = await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${productId}/variants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: `SKU-${Date.now()}-${Math.random()}`, price: '1000.00' })
      .expect(201);
    variantIds.push(variant.body.id);
    const variantMedia = await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${productId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .field('variantId', variant.body.id)
      .attach('file', jpegBuffer(), { filename: 'variant.jpg', contentType: 'image/jpeg' })
      .expect(201);
    mediaIds.push(variantMedia.body.id);
    await request(app.getHttpServer())
      .get(`${PUBLIC_MEDIA_BASE}/${variantMedia.body.id}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/variants/${variant.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${PUBLIC_MEDIA_BASE}/${variantMedia.body.id}`)
      .expect(404);
    // The product-scoped media of the same product stays reachable.
    await request(app.getHttpServer()).get(`${PUBLIC_MEDIA_BASE}/${mediaId}`).expect(200);
  });

  it('returns 404 for a malformed id and for a well-formed but unknown uuid', async () => {
    await request(app.getHttpServer())
      .get(`${PUBLIC_MEDIA_BASE}/${encodeURIComponent('../../etc/passwd')}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${PUBLIC_MEDIA_BASE}/not-a-uuid`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${PUBLIC_MEDIA_BASE}/00000000-0000-4000-8000-000000000000`)
      .expect(404);
  });
});
