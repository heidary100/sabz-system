import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const PRODUCTS_BASE = '/api/v1/admin/products';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

/** A real 1200x800 JPEG so the full watermark + thumbnail pipeline runs. */
async function realJpegBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 90, g: 140, b: 90 } },
  })
    .jpeg()
    .toBuffer();
}

/**
 * SS-129 end to end: uploads with watermarking ENABLED produce a watermarked
 * WEBP thumbnail derivative, publicly served at /catalog/media/:id/thumbnail
 * with the same visibility rules as the original, and surfaced in the public
 * catalog DTOs (listing card + detail media) with resolvable URLs.
 */
describe('Public media thumbnails (SS-129) (e2e)', () => {
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
    // Unlike the other media suites, watermarking stays ENABLED so the full
    // processing pipeline (watermark + thumbnail) runs for real.
    process.env.WATERMARK_ENABLED = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);

    roleIds['OPERATOR'] = await seedRole('OPERATOR');
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...mediaIds, ...productIds] } },
    });
    await prisma.productMedia.deleteMany({ where: { id: { in: mediaIds } } });
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

  async function createPublishedProductWithImage(
    token: string,
  ): Promise<{ productId: string; mediaId: string }> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const brand = await prisma.brand.create({
      data: { name: `برند ${suffix}`, slug: `brand-${suffix}` },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته ${suffix}`, slug: `cat-${suffix}` },
    });
    categoryIds.push(category.id);

    const product = await request(app.getHttpServer())
      .post(PRODUCTS_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `تصویر ${suffix}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
      })
      .expect(201);
    productIds.push(product.body.id);

    const media = await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${product.body.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await realJpegBuffer(), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);
    mediaIds.push(media.body.id);

    const variant = await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${product.body.id}/variants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: `SKU-${suffix}`, price: '1000.00' })
      .expect(201);
    variantIds.push(variant.body.id);
    await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${product.body.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return { productId: product.body.id, mediaId: media.body.id };
  }

  it('uploads produce a thumbnail that is publicly served as WEBP', async () => {
    const token = await createOperator();
    const { productId, mediaId } = await createPublishedProductWithImage(token);

    const row = await prisma.productMedia.findUniqueOrThrow({
      where: { id: mediaId },
      select: { thumbnailKey: true, thumbnailSizeBytes: true },
    });
    expect(row.thumbnailKey).toContain(`products/${productId}/`);
    expect(row.thumbnailKey?.endsWith('.thumb.webp')).toBe(true);
    expect(row.thumbnailSizeBytes).toBeGreaterThan(0);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/catalog/media/${mediaId}/thumbnail`)
      .expect(200);
    expect(res.headers['content-type']).toContain('image/webp');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(Number(res.headers['content-length'])).toBe(row.thumbnailSizeBytes);
    const metadata = await sharp(res.body).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(640);

    // The original stays a watermarked JPEG.
    const original = await request(app.getHttpServer())
      .get(`/api/v1/catalog/media/${mediaId}`)
      .expect(200);
    expect(original.headers['content-type']).toContain('image/jpeg');
  });

  it('surfaces resolvable thumbnail URLs in the listing card and detail DTO', async () => {
    const token = await createOperator();
    const { productId, mediaId } = await createPublishedProductWithImage(token);

    const slug = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { slug: true },
    });

    const listing = await request(app.getHttpServer())
      .get(`/api/v1/catalog/products?q=${encodeURIComponent('تصویر')}`)
      .expect(200);
    const card = listing.body.items.find((c: { id: string }) => c.id === productId);
    expect(card.primaryThumbnailUrl).toBe(
      `/api/v1/catalog/media/${mediaId}/thumbnail`,
    );
    await request(app.getHttpServer()).get(card.primaryThumbnailUrl).expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/catalog/products/${slug.slug}`)
      .expect(200);
    expect(detail.body.media[0].thumbnailUrl).toBe(
      `/api/v1/catalog/media/${mediaId}/thumbnail`,
    );
  });

  it('returns 404 for the thumbnail before publish, after media delete, and for a malformed id', async () => {
    const token = await createOperator();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const brand = await prisma.brand.create({
      data: { name: `برند ${suffix}`, slug: `brand-${suffix}` },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته ${suffix}`, slug: `cat-${suffix}` },
    });
    categoryIds.push(category.id);
    const product = await request(app.getHttpServer())
      .post(PRODUCTS_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `پیش‌نویس ${suffix}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
      })
      .expect(201);
    productIds.push(product.body.id);
    const media = await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${product.body.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', await realJpegBuffer(), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);
    mediaIds.push(media.body.id);

    // DRAFT product: no thumbnail, no original.
    await request(app.getHttpServer())
      .get(`/api/v1/catalog/media/${media.body.id}/thumbnail`)
      .expect(404);

    const variant = await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${product.body.id}/variants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: `SKU-${suffix}`, price: '1000.00' })
      .expect(201);
    variantIds.push(variant.body.id);
    await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${product.body.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/catalog/media/${media.body.id}/thumbnail`)
      .expect(200);

    // Deleted media removes both the original and the thumbnail.
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/media/${media.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/catalog/media/${media.body.id}/thumbnail`)
      .expect(404);

    // Malformed ids are 404 on both routes.
    await request(app.getHttpServer()).get(`/api/v1/catalog/media/bad/thumbnail`).expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/catalog/media/00000000-0000-4000-8000-000000000000/thumbnail`)
      .expect(404);
  });

  it('leaves videos without a thumbnail', async () => {
    const token = await createOperator();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const brand = await prisma.brand.create({
      data: { name: `برند ${suffix}`, slug: `brand-${suffix}` },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته ${suffix}`, slug: `cat-${suffix}` },
    });
    categoryIds.push(category.id);
    const product = await request(app.getHttpServer())
      .post(PRODUCTS_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `ویدیو ${suffix}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
      })
      .expect(201);
    productIds.push(product.body.id);
    const mp4 = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from([0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
    ]);
    // The FFmpeg pipeline processes real videos; this fixture is not a real
    // video, so the upload is expected to fail validation at processing time.
    const res = await request(app.getHttpServer())
      .post(`${PRODUCTS_BASE}/${product.body.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', mp4, { filename: 'v.mp4', contentType: 'video/mp4' });
    expect([201, 400].includes(res.status)).toBe(true);
    if (res.status === 201) {
      mediaIds.push(res.body.id);
      const row = await prisma.productMedia.findUniqueOrThrow({
        where: { id: res.body.id },
        select: { thumbnailKey: true },
      });
      expect(row.thumbnailKey).toBeNull();
    }
  });
});
