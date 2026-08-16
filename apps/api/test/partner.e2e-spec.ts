import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { UserStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(30_000);

const PDF = Buffer.from('%PDF-1.7\npartner license document');

async function createAuthenticatedUser(
  app: INestApplication,
  mobile: string,
): Promise<{ userId: string; accessToken: string }> {
  const prisma = app.get(PrismaService);
  const tokenService = app.get(TokenService);

  const user = await prisma.user.create({
    data: { mobile, status: UserStatus.ACTIVE },
  });
  await prisma.userProfile.create({
    data: { userId: user.id, firstName: 'علی', lastName: 'احمدی' },
  });
  const tokens = await tokenService.createSession(user.id);

  return { userId: user.id, accessToken: tokens.accessToken };
}

describe('Partner application and document API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storageDir: string;

  const mobiles: string[] = [];

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'partner-e2e-'));
    process.env.DOCUMENT_STORAGE_DIR = storageDir;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { mobile: { in: mobiles } },
    });
    await app.close();
    await rm(storageDir, { recursive: true, force: true });
    delete process.env.DOCUMENT_STORAGE_DIR;
  });

  async function createUser(mobile: string) {
    mobiles.push(mobile);
    return createAuthenticatedUser(app, mobile);
  }

  const base = '/api/v1/partners';

  describe('authentication', () => {
    it('rejects every partner endpoint without a token', async () => {
      await request(app.getHttpServer()).post(`${base}/apply`).expect(401);
      await request(app.getHttpServer()).get(`${base}/application`).expect(401);
      await request(app.getHttpServer()).patch(`${base}/application`).expect(401);
      await request(app.getHttpServer()).post(`${base}/documents`).expect(401);
      await request(app.getHttpServer()).get(`${base}/documents`).expect(401);
      await request(app.getHttpServer())
        .get(`${base}/documents/00000000-0000-0000-0000-000000000000`)
        .expect(401);
      await request(app.getHttpServer())
        .delete(`${base}/documents/00000000-0000-0000-0000-000000000000`)
        .expect(401);
    });
  });

  describe('create application', () => {
    it('returns 400 when the user has no profile', async () => {
      const { accessToken, userId } = await createUser('+989100000001');
      await prisma.userProfile.deleteMany({ where: { userId } });

      const response = await request(app.getHttpServer())
        .post(`${base}/apply`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ businessName: 'اکسیر الکترونیک' })
        .expect(400);

      expect(response.body.message).toContain('پروفایل');
    });

    it('creates a DRAFT application', async () => {
      const { accessToken } = await createUser('+989100000002');

      const response = await request(app.getHttpServer())
        .post(`${base}/apply`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ businessName: 'اکسیر الکترونیک' })
        .expect(201);

      expect(response.body.approvalStatus).toBe('DRAFT');
      expect(response.body.businessName).toBe('اکسیر الکترونیک');
      expect(JSON.stringify(response.body)).not.toContain('storageKey');
    });

    it('rejects a second application with 409', async () => {
      const { accessToken } = await createUser('+989100000003');
      const apply = () =>
        request(app.getHttpServer())
          .post(`${base}/apply`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ businessName: 'اکسیر' });

      await apply().expect(201);
      await apply().expect(409);
    });

    it('does not create PENDING without a business license (immediate submit)', async () => {
      const { accessToken, userId } = await createUser('+989100000004');

      const response = await request(app.getHttpServer())
        .post(`${base}/apply`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          businessName: 'اکسیر',
          businessLicenseNo: 'LIC-1',
          address: 'تهران',
          city: 'تهران',
          province: 'تهران',
          submit: true,
        })
        .expect(422);

      expect(response.body.message).toContain('جواز کسب');

      const partnerCount = await prisma.partner.count({
        where: { profile: { userId } },
      });
      expect(partnerCount).toBe(0);
    });

    it('rejects PATCH submit without a business license with 422', async () => {
      const { accessToken } = await createUser('+989100000009');

      await request(app.getHttpServer())
        .post(`${base}/apply`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          businessName: 'اکسیر',
          businessLicenseNo: 'LIC-1',
          address: 'تهران',
          city: 'تهران',
          province: 'تهران',
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`${base}/application`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ submit: true })
        .expect(422);
    });
  });

  describe('documents', () => {
    let owner: { userId: string; accessToken: string };
    let partnerId: string;
    let documentId: string;

    beforeAll(async () => {
      owner = await createUser('+989100000005');
      const apply = await request(app.getHttpServer())
        .post(`${base}/apply`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          businessName: 'اکسیر',
          businessLicenseNo: 'LIC-1',
          address: 'تهران',
          city: 'تهران',
          province: 'تهران',
        })
        .expect(201);
      partnerId = apply.body.id;
    });

    it('uploads a business license', async () => {
      const response = await request(app.getHttpServer())
        .post(`${base}/documents`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('type', 'BUSINESS_LICENSE')
        .attach('file', PDF, { filename: 'گواهی-فعالیت.pdf', contentType: 'application/pdf' })
        .expect(201);

      documentId = response.body.id;
      expect(response.body.type).toBe('BUSINESS_LICENSE');
      expect(response.body.mimeType).toBe('application/pdf');
      expect(response.body.originalName).toBe('گواهی-فعالیت.pdf');
      expect(JSON.stringify(response.body)).not.toContain('storageKey');
    });

    it('rejects a file whose magic bytes do not match the declared type', async () => {
      await request(app.getHttpServer())
        .post(`${base}/documents`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('type', 'SUPPORTING')
        .attach('file', Buffer.from('not really a pdf'), {
          filename: 'fake.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
    });

    it('rejects an upload over the 10 MB limit with 400', async () => {
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
      await request(app.getHttpServer())
        .post(`${base}/documents`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('type', 'SUPPORTING')
        .attach('file', oversized, {
          filename: 'big.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
    });

    it('rejects an unsupported declared MIME type', async () => {
      await request(app.getHttpServer())
        .post(`${base}/documents`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('type', 'SUPPORTING')
        .attach('file', Buffer.from('plain'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })
        .expect(400);
    });

    it('lists active documents for the owner', async () => {
      const response = await request(app.getHttpServer())
        .get(`${base}/documents`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(documentId);
      expect(JSON.stringify(response.body)).not.toContain('storageKey');
    });

    it('downloads an owned document', async () => {
      const response = await request(app.getHttpServer())
        .get(`${base}/documents/${documentId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(response.body).toEqual(PDF);
      expect(response.headers['content-type']).toContain('application/pdf');
      const disposition = response.headers['content-disposition']!;
      expect(disposition).toContain('attachment');
      const utf8Match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      expect(utf8Match).toBeTruthy();
      expect(decodeURIComponent(utf8Match![1]!)).toBe('گواهی-فعالیت.pdf');
    });

    it('submits the application to PENDING', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${base}/application`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ submit: true })
        .expect(200);

      expect(response.body.approvalStatus).toBe('PENDING');
      expect(response.body.rejectedAt).toBeNull();
      expect(response.body.rejectionReason).toBeNull();
    });

    it('locks application fields while PENDING', async () => {
      await request(app.getHttpServer())
        .patch(`${base}/application`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ businessName: 'نام جدید' })
        .expect(409);
    });

    it('locks document mutations while PENDING', async () => {
      await request(app.getHttpServer())
        .post(`${base}/documents`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .field('type', 'SUPPORTING')
        .attach('file', PDF, { filename: 'support.pdf', contentType: 'application/pdf' })
        .expect(409);

      await request(app.getHttpServer())
        .delete(`${base}/documents/${documentId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(409);
    });

    it('returns the application with its documents and no internal keys', async () => {
      const response = await request(app.getHttpServer())
        .get(`${base}/application`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(response.body.approvalStatus).toBe('PENDING');
      expect(response.body.documents).toHaveLength(1);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('storageKey');
      expect(serialized).not.toContain('reviewNotes');
    });

    it('allows resubmission after rejection', async () => {
      await prisma.partner.update({
        where: { id: partnerId },
        data: {
          approvalStatus: 'REJECTED',
          rejectedAt: new Date(),
          rejectionReason: 'مدارک ناقص',
        },
      });

      const rejected = await request(app.getHttpServer())
        .get(`${base}/application`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(rejected.body.approvalStatus).toBe('REJECTED');

      const resubmit = await request(app.getHttpServer())
        .patch(`${base}/application`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ submit: true })
        .expect(200);
      expect(resubmit.body.approvalStatus).toBe('PENDING');
      expect(resubmit.body.rejectedAt).toBeNull();
      expect(resubmit.body.rejectionReason).toBeNull();
    });
  });

  describe('IDOR protection', () => {
    let attacker: { userId: string; accessToken: string };
    let victim: { userId: string; accessToken: string };
    let victimDocumentId: string;

    beforeAll(async () => {
      attacker = await createUser('+989100000006');
      victim = await createUser('+989100000007');

      await request(app.getHttpServer())
        .post(`${base}/apply`)
        .set('Authorization', `Bearer ${victim.accessToken}`)
        .send({
          businessName: 'قربانی',
          businessLicenseNo: 'LIC-V',
          address: 'تهران',
          city: 'تهران',
          province: 'تهران',
        })
        .expect(201);

      const upload = await request(app.getHttpServer())
        .post(`${base}/documents`)
        .set('Authorization', `Bearer ${victim.accessToken}`)
        .field('type', 'BUSINESS_LICENSE')
        .attach('file', PDF, { filename: 'license.pdf', contentType: 'application/pdf' })
        .expect(201);
      victimDocumentId = upload.body.id;
    });

    it('returns 404 for another user\'s application', async () => {
      await request(app.getHttpServer())
        .get(`${base}/application`)
        .set('Authorization', `Bearer ${attacker.accessToken}`)
        .expect(404);
    });

    it('returns 404 when listing another user\'s documents', async () => {
      await request(app.getHttpServer())
        .get(`${base}/documents`)
        .set('Authorization', `Bearer ${attacker.accessToken}`)
        .expect(404);
    });

    it('returns 404 when downloading another user\'s document', async () => {
      await request(app.getHttpServer())
        .get(`${base}/documents/${victimDocumentId}`)
        .set('Authorization', `Bearer ${attacker.accessToken}`)
        .expect(404);
    });

    it('returns 404 when deleting another user\'s document', async () => {
      await request(app.getHttpServer())
        .delete(`${base}/documents/${victimDocumentId}`)
        .set('Authorization', `Bearer ${attacker.accessToken}`)
        .expect(404);
    });

    it('returns 404 when mutating another user\'s application', async () => {
      await request(app.getHttpServer())
        .patch(`${base}/application`)
        .set('Authorization', `Bearer ${attacker.accessToken}`)
        .send({ submit: true })
        .expect(404);
    });

    it('rejects a client-supplied ownership override attempt on apply', async () => {
      await request(app.getHttpServer())
        .post(`${base}/apply`)
        .set('Authorization', `Bearer ${attacker.accessToken}`)
        .send({
          businessName: 'حمله',
          profileId: victim.userId,
          partnerId: '00000000-0000-0000-0000-000000000000',
          approvalStatus: 'APPROVED',
        })
        .expect(201);
    });
  });

  describe('delete document while editable', () => {
    it('removes an owned document in DRAFT state', async () => {
      const { accessToken } = await createUser('+989100000008');
      await request(app.getHttpServer())
        .post(`${base}/apply`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ businessName: 'اکسیر' })
        .expect(201);

      const upload = await request(app.getHttpServer())
        .post(`${base}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .field('type', 'SUPPORTING')
        .attach('file', PDF, { filename: 'support.pdf', contentType: 'application/pdf' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`${base}/documents/${upload.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const list = await request(app.getHttpServer())
        .get(`${base}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(list.body).toHaveLength(0);
    });
  });
});
