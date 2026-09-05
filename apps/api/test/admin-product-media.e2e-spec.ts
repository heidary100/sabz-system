import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BASE = '/api/v1/admin/products';
const MEDIA_BASE = '/api/v1/admin/media';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
}

function mp4Buffer(): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from([0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
  ]);
}

describe('Admin product media API (SS-105) (e2e)', () => {
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
    // This suite exercises the HTTP/auth/media-flow contract, not the
    // watermark pipeline (covered by unit/integration specs). Watermarking is
    // disabled so uploads of fixture bytes (fake MP4 magic) are stored as-is.
    process.env.WATERMARK_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);

    for (const role of ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN']) {
      roleIds[role] = await seedRole(role);
    }
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: mediaIds } },
    });
    await prisma.productMedia.deleteMany({ where: { id: { in: mediaIds } } });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: productIds } },
    });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    const orphanProducts = await prisma.product.findMany({
      where: {
        OR: [
          { brandId: { in: brandIds } },
          { categoryId: { in: categoryIds } },
        ],
      },
      select: { id: true },
    });
    const orphanIds = orphanProducts.map((row) => row.id);
    await prisma.productMedia.deleteMany({ where: { productId: { in: orphanIds } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: orphanIds } } });
    await prisma.product.deleteMany({ where: { id: { in: orphanIds } } });
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

  async function createUser(role: string) {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: { mobile, status: 'ACTIVE' },
    });
    userIds.push(user.id);
    if (role) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: roleIds[role]!, assignedBy: user.id },
      });
    }
    await prisma.userProfile.create({
      data: { userId: user.id, firstName: 'علی', lastName: 'احمدی' },
    });
    const tokens = await tokenService.createSession(user.id);
    return {
      userId: user.id,
      accessToken: tokens.accessToken,
    };
  }

  async function createBrandAndCategory() {
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
    return { brandId: brand.id, categoryId: category.id };
  }

  async function createProduct(token: string): Promise<string> {
    const { brandId, categoryId } = await createBrandAndCategory();
    const res = await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `محصول ${Date.now()}-${Math.random()}`,
        brandId,
        categoryId,
        condition: ProductCondition.NEW,
      })
      .expect(201);
    productIds.push(res.body.id);
    return res.body.id;
  }

  async function uploadJpeg(token: string, productId: string) {
    return request(app.getHttpServer())
      .post(`${BASE}/${productId}/media`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', jpegBuffer(), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });
  }

  describe('authentication and authorization', () => {
    it('rejects media endpoints without a token with 401', async () => {
      const id = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer()).post(`${BASE}/${id}/media`).expect(401);
      await request(app.getHttpServer()).get(`${BASE}/${id}/media`).expect(401);
      await request(app.getHttpServer()).get(`${BASE}/${id}/media/${id}`).expect(401);
      await request(app.getHttpServer()).delete(`${MEDIA_BASE}/${id}`).expect(401);
    });

    it('rejects CUSTOMER and PARTNER with 403', async () => {
      const customer = await createUser('CUSTOMER');
      const partner = await createUser('PARTNER');
      const id = '00000000-0000-0000-0000-000000000000';

      for (const token of [customer.accessToken, partner.accessToken]) {
        await request(app.getHttpServer())
          .post(`${BASE}/${id}/media`)
          .set('Authorization', `Bearer ${token}`)
          .attach('file', jpegBuffer(), { filename: 'a.jpg', contentType: 'image/jpeg' })
          .expect(403);
        await request(app.getHttpServer())
          .get(`${BASE}/${id}/media`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(app.getHttpServer())
          .delete(`${MEDIA_BASE}/${id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
    });

    it('allows OPERATOR and ADMIN to upload', async () => {
      const operator = await createUser('OPERATOR');
      const admin = await createUser('ADMIN');
      for (const token of [operator.accessToken, admin.accessToken]) {
        const productId = await createProduct(token);
        const res = await uploadJpeg(token, productId);
        expect(res.status).toBe(201);
        mediaIds.push(res.body.id);
      }
    });
  });

  describe('upload validation', () => {
    it('returns 400 for an invalid/unsupported file', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct(operator.accessToken);
      await request(app.getHttpServer())
        .post(`${BASE}/${productId}/media`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .attach('file', Buffer.from('not a media file'), {
          filename: 'x.txt',
          contentType: 'text/plain',
        })
        .expect(400);
    });

    it('returns 400 for a MIME/magic mismatch', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct(operator.accessToken);
      await request(app.getHttpServer())
        .post(`${BASE}/${productId}/media`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .attach('file', jpegBuffer(), { filename: 'x.png', contentType: 'image/png' })
        .expect(400);
    });

    it('returns 404 for a missing product', async () => {
      const operator = await createUser('OPERATOR');
      const id = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .post(`${BASE}/${id}/media`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .attach('file', jpegBuffer(), { filename: 'a.jpg', contentType: 'image/jpeg' })
        .expect(404);
    });

    it('returns 404 when the variant belongs to another product', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct(operator.accessToken);
      const otherId = await createProduct(operator.accessToken);
      const variant = await prisma.productVariant.create({
        data: { productId: otherId, sku: `SKU-${Date.now()}-${Math.random()}`, price: '1.00' },
      });
      variantIds.push(variant.id);

      const res = await request(app.getHttpServer())
        .post(`${BASE}/${productId}/media`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .field('variantId', variant.id)
        .attach('file', jpegBuffer(), { filename: 'a.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(404);
    });
  });

  describe('upload / list / download / delete flow', () => {
    it('uploads, lists, downloads and deletes media without leaking storage internals', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct(operator.accessToken);

      const first = await uploadJpeg(operator.accessToken, productId);
      expect(first.status).toBe(201);
      expect(first.body.mediaType).toBe('IMAGE');
      expect(first.body.isPrimary).toBe(true);
      mediaIds.push(first.body.id);
      expect(JSON.stringify(first.body)).not.toContain('storageKey');
      expect(JSON.stringify(first.body)).not.toContain('deletedAt');

      const second = await uploadJpeg(operator.accessToken, productId);
      expect(second.status).toBe(201);
      expect(second.body.isPrimary).toBe(false);
      mediaIds.push(second.body.id);

      // video is never primary
      const video = await request(app.getHttpServer())
        .post(`${BASE}/${productId}/media`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .attach('file', mp4Buffer(), { filename: 'v.mp4', contentType: 'video/mp4' });
      expect(video.status).toBe(201);
      expect(video.body.mediaType).toBe('VIDEO');
      expect(video.body.isPrimary).toBe(false);
      mediaIds.push(video.body.id);

      const list = await request(app.getHttpServer())
        .get(`${BASE}/${productId}/media`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(Array.isArray(list.body)).toBe(true);
      expect(list.body.length).toBe(3);
      expect(JSON.stringify(list.body)).not.toContain('storageKey');

      // download returns the stored mime type
      const download = await request(app.getHttpServer())
        .get(`${BASE}/${productId}/media/${first.body.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(download.headers['content-type']).toContain('image/jpeg');
      expect(download.headers['content-disposition']).toContain('attachment');

      // detail reflects the media
      const detail = await request(app.getHttpServer())
        .get(`${BASE}/${productId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(detail.body.media.length).toBe(3);
      expect(JSON.stringify(detail.body)).not.toContain('storageKey');

      // delete the primary -> next image promoted
      await request(app.getHttpServer())
        .delete(`${MEDIA_BASE}/${first.body.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      const listAfter = await request(app.getHttpServer())
        .get(`${BASE}/${productId}/media`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(listAfter.body.map((m: { id: string }) => m.id)).not.toContain(first.body.id);

      // download of deleted media -> 404
      await request(app.getHttpServer())
        .get(`${BASE}/${productId}/media/${first.body.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);

      const audits = await prisma.auditLog.findMany({
        where: { entityId: { in: mediaIds }, action: 'PRODUCT_MEDIA_UPLOADED' },
      });
      for (const audit of audits) {
        expect(JSON.stringify(audit.after)).not.toContain('storageKey');
        expect(JSON.stringify(audit.after)).not.toContain('deletedAt');
      }
    });

    it('deletes media and removes it from detail', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct(operator.accessToken);
      const res = await uploadJpeg(operator.accessToken, productId);
      mediaIds.push(res.body.id);

      await request(app.getHttpServer())
        .delete(`${MEDIA_BASE}/${res.body.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      const detail = await request(app.getHttpServer())
        .get(`${BASE}/${productId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(detail.body.media.length).toBe(0);
    });

    it('returns 404 deleting a non-existent media', async () => {
      const operator = await createUser('OPERATOR');
      const id = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .delete(`${MEDIA_BASE}/${id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
    });
  });
});
