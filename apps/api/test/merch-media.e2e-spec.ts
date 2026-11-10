import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BASE = '/api/v1/admin/merchandising/media';
const PUBLIC_BASE = '/api/v1/catalog/merch-media';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

async function jpegBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 40, g: 90, b: 60 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe('Merchandising media API (Task 05.2) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let storageDir: string;
  const originalEnv = {
    watermark: process.env.WATERMARK_ENABLED,
    storage: process.env.PRODUCT_MEDIA_STORAGE_DIR,
    temp: process.env.PRODUCT_MEDIA_TEMP_DIR,
  };
  const mobiles: string[] = [];
  const userIds: string[] = [];
  const roleIds: Record<string, string> = {};
  const mediaIds: string[] = [];

  async function seedRole(name: string): Promise<string> {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) return existing.id;
    try {
      return (await prisma.role.create({ data: { name } })).id;
    } catch {
      return (await prisma.role.findUniqueOrThrow({ where: { name } })).id;
    }
  }

  async function createUser(role: string) {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({ data: { mobile, status: 'ACTIVE' } });
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
    return { userId: user.id, accessToken: tokens.accessToken };
  }

  async function upload(token: string, altFa = 'تصویر کمپین') {
    const res = await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .field('altFa', altFa)
      .attach('file', await jpegBuffer(), {
        filename: 'campaign.jpg',
        contentType: 'image/jpeg',
      });
    if (res.status === 201) mediaIds.push(res.body.id);
    return res;
  }

  beforeAll(async () => {
    process.env.WATERMARK_ENABLED = 'false';
    storageDir = await mkdtemp(join(tmpdir(), 'sabz-merch-media-e2e-'));
    process.env.PRODUCT_MEDIA_STORAGE_DIR = storageDir;
    process.env.PRODUCT_MEDIA_TEMP_DIR = join(storageDir, 'tmp');

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
    await prisma.homepagePublication.deleteMany({});
    await prisma.merchCampaignMedia.deleteMany({});
    await prisma.merchCampaign.deleteMany({});
    await prisma.merchMedia.deleteMany({});
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: mediaIds } } });
    await prisma.homepagePublication.deleteMany({});
    await prisma.merchCampaignMedia.deleteMany({});
    await prisma.merchCampaign.deleteMany({});
    await prisma.merchMedia.deleteMany({});
    await prisma.auditLog.deleteMany({
      where: { OR: [{ entityId: { in: userIds } }, { userId: { in: userIds } }] },
    });
    await prisma.userSession.deleteMany({ where: { user: { mobile: { in: mobiles } } } });
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
    await rm(storageDir, { recursive: true, force: true });
    if (originalEnv.watermark === undefined) delete process.env.WATERMARK_ENABLED;
    else process.env.WATERMARK_ENABLED = originalEnv.watermark;
    if (originalEnv.storage === undefined) delete process.env.PRODUCT_MEDIA_STORAGE_DIR;
    else process.env.PRODUCT_MEDIA_STORAGE_DIR = originalEnv.storage;
    if (originalEnv.temp === undefined) delete process.env.PRODUCT_MEDIA_TEMP_DIR;
    else process.env.PRODUCT_MEDIA_TEMP_DIR = originalEnv.temp;
  });

  it('rejects unauthenticated and non-admin requests', async () => {
    const id = '00000000-0000-0000-0000-000000000000';
    await request(app.getHttpServer()).get(BASE).expect(401);
    await request(app.getHttpServer())
      .post(BASE)
      .attach('file', await jpegBuffer(), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(401);
    await request(app.getHttpServer()).get(`${BASE}/${id}`).expect(401);
    await request(app.getHttpServer())
      .patch(`${BASE}/${id}`)
      .send({ altFa: 'x' })
      .expect(401);
    await request(app.getHttpServer()).delete(`${BASE}/${id}`).expect(401);
    await request(app.getHttpServer()).get(`${BASE}/${id}/file`).expect(401);
    await request(app.getHttpServer()).get(`${BASE}/${id}/thumbnail`).expect(401);

    const customer = await createUser('CUSTOMER');
    const partner = await createUser('PARTNER');
    for (const token of [customer.accessToken, partner.accessToken]) {
      await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(app.getHttpServer())
        .delete(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    }
  });

  it('allows ADMIN and OPERATOR to upload unpublished media', async () => {
    for (const role of ['ADMIN', 'OPERATOR']) {
      const user = await createUser(role);
      const res = await upload(user.accessToken, `آلت ${role}`);
      expect(res.status).toBe(201);
      expect(res.body.publishedAt).toBeNull();
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.altFa).toBe(`آلت ${role}`);
      expect(JSON.stringify(res.body)).not.toContain('storageKey');
      expect(res.body.width).toBe(16);
      expect(res.body.height).toBe(16);
    }
  });

  it('supports empty files and MIME/content mismatches with 400', async () => {
    const operator = await createUser('OPERATOR');
    await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .attach('file', Buffer.from('not an image'), {
        filename: 'x.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .attach('file', await jpegBuffer(), {
        filename: 'x.png',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('lists, searches, filters, and returns usage detail', async () => {
    const operator = await createUser('OPERATOR');
    const first = await upload(operator.accessToken, 'هیرو فروشگاه');
    const second = await upload(operator.accessToken, 'بنر پیشنهاد');
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const list = await request(app.getHttpServer())
      .get(`${BASE}?page=1&limit=1&isPublished=false`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(2);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].publishedAt).toBeNull();

    const search = await request(app.getHttpServer())
      .get(`${BASE}?q=${encodeURIComponent('هیرو')}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);
    expect(search.body.items.some((item: { id: string }) => item.id === first.body.id)).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`${BASE}/${first.body.id}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);
    expect(detail.body.usage).toEqual({
      campaigns: [],
      currentPublications: [],
      scheduledPublications: [],
    });
  });

  it('updates only alt text and rejects server-controlled fields', async () => {
    const operator = await createUser('OPERATOR');
    const uploaded = await upload(operator.accessToken, 'قدیمی');
    const updated = await request(app.getHttpServer())
      .patch(`${BASE}/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ altFa: 'جدید' })
      .expect(200);
    expect(updated.body.altFa).toBe('جدید');

    await request(app.getHttpServer())
      .patch(`${BASE}/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ storageKey: 'merchandising/evil.jpg' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${BASE}/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ publishedAt: new Date().toISOString() })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`${BASE}/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send([])
      .expect(400);

    await request(app.getHttpServer())
      .patch(`${BASE}/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ altFa: 42 })
      .expect(400);
  });

  it('serves admin files but keeps unpublished media out of public delivery', async () => {
    const operator = await createUser('OPERATOR');
    const uploaded = await upload(operator.accessToken);
    const id = uploaded.body.id;

    const adminFile = await request(app.getHttpServer())
      .get(`${BASE}/${id}/file`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);
    expect(adminFile.headers['content-type']).toContain('image/jpeg');
    expect(adminFile.headers['cache-control']).toContain('no-store');
    const adminThumbnail = await request(app.getHttpServer())
      .get(`${BASE}/${id}/thumbnail`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);
    expect(adminThumbnail.headers['content-type']).toContain('image/webp');

    await request(app.getHttpServer()).get(`${PUBLIC_BASE}/${id}`).expect(404);

    await prisma.merchMedia.update({
      where: { id },
      data: { publishedAt: new Date() },
    });
    const publicFile = await request(app.getHttpServer())
      .get(`${PUBLIC_BASE}/${id}`)
      .expect(200);
    expect(publicFile.headers['content-type']).toContain('image/jpeg');
    expect(publicFile.headers['cache-control']).toContain('public');
    const publicThumbnail = await request(app.getHttpServer())
      .get(`${PUBLIC_BASE}/${id}/thumbnail`)
      .expect(200);
    expect(publicThumbnail.headers['content-type']).toContain('image/webp');

    await prisma.merchMedia.update({
      where: { id },
      data: { publishedAt: null },
    });
    await request(app.getHttpServer()).get(`${PUBLIC_BASE}/${id}`).expect(404);
  });

  it('soft-deletes unreferenced media and excludes it from admin/public access', async () => {
    const operator = await createUser('OPERATOR');
    const uploaded = await upload(operator.accessToken);
    const id = uploaded.body.id;
    await request(app.getHttpServer())
      .delete(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(404);
    const remaining = await request(app.getHttpServer())
      .get(BASE)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);
    expect(
      remaining.body.items.some((item: { id: string }) => item.id === id),
    ).toBe(false);
    await request(app.getHttpServer()).get(`${PUBLIC_BASE}/${id}`).expect(404);
  });

  it('blocks deletion for campaign references and published/scheduled snapshots', async () => {
    const operator = await createUser('OPERATOR');

    const campaignMedia = await upload(operator.accessToken);
    const campaign = await prisma.merchCampaign.create({
      data: {
        internalName: `e2e-campaign-${Date.now()}`,
        type: 'EDITORIAL',
        titleFa: 'کمپین',
      },
    });
    await prisma.merchCampaignMedia.create({
      data: {
        campaignId: campaign.id,
        mediaId: campaignMedia.body.id,
        slot: 'BANNER',
      },
    });
    await request(app.getHttpServer())
      .delete(`${BASE}/${campaignMedia.body.id}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(409);

    const publishedMedia = await upload(operator.accessToken);
    await prisma.homepagePublication.create({
      data: {
        version: Math.floor(Date.now() / 1000),
        status: 'PUBLISHED',
        publishedAt: new Date(),
        sections: [{ media: [{ mediaId: publishedMedia.body.id }] }],
        sourceDraftRevision: 0,
      },
    });
    await request(app.getHttpServer())
      .delete(`${BASE}/${publishedMedia.body.id}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(409);

    const scheduledMedia = await upload(operator.accessToken);
    await prisma.homepagePublication.create({
      data: {
        version: Math.floor(Date.now() / 1000) + 1,
        status: 'SCHEDULED',
        publishAt: new Date(Date.now() + 60_000),
        sections: [{ media: [{ mediaId: scheduledMedia.body.id }] }],
        sourceDraftRevision: 0,
      },
    });
    await request(app.getHttpServer())
      .delete(`${BASE}/${scheduledMedia.body.id}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(409);
    await request(app.getHttpServer())
      .get(`${PUBLIC_BASE}/${scheduledMedia.body.id}`)
      .expect(404);
  });
});
