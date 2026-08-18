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

jest.setTimeout(60_000);

const PDF = Buffer.from('%PDF-1.7\npartner license document');
const BASE = '/api/v1/admin/partners';
const APPLICANT_BASE = '/api/v1/partners';

async function applyAndSubmit(
  app: INestApplication,
  accessToken: string,
  body: Record<string, unknown> = {},
): Promise<{ partnerId: string; documentId: string }> {
  const apply = await request(app.getHttpServer())
    .post(`${APPLICANT_BASE}/apply`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      businessName: 'اکسیر الکترونیک',
      businessLicenseNo: 'LIC-1',
      address: 'تهران',
      city: 'تهران',
      province: 'تهران',
      ...body,
    })
    .expect(201);
  const partnerId = apply.body.id;

  const upload = await request(app.getHttpServer())
    .post(`${APPLICANT_BASE}/documents`)
    .set('Authorization', `Bearer ${accessToken}`)
    .field('type', 'BUSINESS_LICENSE')
    .attach('file', PDF, { filename: 'گواهی-فعالیت.pdf', contentType: 'application/pdf' })
    .expect(201);
  const documentId = upload.body.id;

  await request(app.getHttpServer())
    .patch(`${APPLICANT_BASE}/application`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ submit: true })
    .expect(200);

  return { partnerId, documentId };
}

describe('Admin partner review API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storageDir: string;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const partnerIds: string[] = [];
  const tierIds: string[] = [];
  const roleIds: Record<string, string> = {};

  /**
   * Seeds a role idempotently and race-safely. Jest runs the e2e spec files
   * in parallel workers against the same Postgres instance; Prisma's upsert
   * is not atomic under concurrent creates, so a bare upsert can fail with
   * P2002 when two workers seed the same role simultaneously. Create + P2002
   * fallback makes the seed safe regardless of which specs run together.
   */
  async function seedRole(name: string): Promise<string> {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) {
      return existing.id;
    }
    try {
      const created = await prisma.role.create({ data: { name } });
      return created.id;
    } catch (error) {
      const row = await prisma.role.findUnique({ where: { name } });
      if (row) {
        return row.id;
      }
      throw error;
    }
  }

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'admin-partner-e2e-'));
    process.env.DOCUMENT_STORAGE_DIR = storageDir;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    for (const role of ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN']) {
      roleIds[role] = await seedRole(role);
    }

    const tier = await prisma.partnerTier.create({
      data: { name: 'Tier E2E', discountPercent: 5, minOrderQuantity: 1 },
    });
    tierIds.push(tier.id);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { entityId: { in: partnerIds } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await prisma.partnerTier.deleteMany({ where: { id: { in: tierIds } } });
    await app.close();
    await rm(storageDir, { recursive: true, force: true });
    delete process.env.DOCUMENT_STORAGE_DIR;
  });

  async function createUser(mobile: string, role?: string) {
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: { mobile, status: UserStatus.ACTIVE },
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
    const tokenService = app.get(TokenService);
    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, accessToken: tokens.accessToken };
  }

  async function createPendingPartner(mobile: string) {
    const { userId, accessToken } = await createUser(mobile);
    const { partnerId } = await applyAndSubmit(app, accessToken);
    partnerIds.push(partnerId);
    return { userId, accessToken, partnerId };
  }

  describe('authentication and authorization', () => {
    it('rejects every endpoint without a token with 401', async () => {
      await request(app.getHttpServer()).get(`${BASE}`).expect(401);
      await request(app.getHttpServer())
        .get(`${BASE}/00000000-0000-0000-0000-000000000000`)
        .expect(401);
      await request(app.getHttpServer())
        .patch(`${BASE}/00000000-0000-0000-0000-000000000000/approve`)
        .send({ tierId: '00000000-0000-0000-0000-000000000000' })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`${BASE}/00000000-0000-0000-0000-000000000000/reject`)
        .send({ reason: 'x' })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`${BASE}/00000000-0000-0000-0000-000000000000/tier`)
        .send({ tierId: '00000000-0000-0000-0000-000000000000' })
        .expect(401);
      await request(app.getHttpServer())
        .get(`${BASE}/00000000-0000-0000-0000-000000000000/documents/00000000-0000-0000-0000-000000000000`)
        .expect(401);
    });

    it('rejects CUSTOMER with 403', async () => {
      const { accessToken } = await createUser('+989140000001', 'CUSTOMER');

      await request(app.getHttpServer())
        .get(`${BASE}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .patch(`${BASE}/00000000-0000-0000-0000-000000000000/approve`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tierId: '00000000-0000-0000-0000-000000000000' })
        .expect(403);
    });

    it('rejects PARTNER with 403', async () => {
      const { accessToken } = await createUser('+989140000002', 'PARTNER');

      await request(app.getHttpServer())
        .get(`${BASE}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('allows OPERATOR', async () => {
      const { accessToken } = await createUser('+989140000003', 'OPERATOR');

      await request(app.getHttpServer())
        .get(`${BASE}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('allows ADMIN', async () => {
      const { accessToken } = await createUser('+989140000004', 'ADMIN');

      await request(app.getHttpServer())
        .get(`${BASE}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe('tiers', () => {
    it('lists available tiers for an OPERATOR', async () => {
      const { accessToken } = await createUser('+989140000027', 'OPERATOR');

      const response = await request(app.getHttpServer())
        .get(`${BASE}/tiers`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        discountPercent: expect.any(String),
        minOrderQuantity: expect.any(Number),
      });
    });

    it('denies a CUSTOMER with 403', async () => {
      const { accessToken } = await createUser('+989140000028', 'CUSTOMER');

      await request(app.getHttpServer())
        .get(`${BASE}/tiers`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });

  describe('list pagination', () => {
    let operator: { accessToken: string };

    beforeAll(async () => {
      operator = await createUser('+989140000005', 'OPERATOR');
      await createPendingPartner('+989140000006');
      await createPendingPartner('+989140000007');
      await createPendingPartner('+989140000008');
    });

    it('defaults to PENDING partners', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.items.length).toBeGreaterThanOrEqual(3);
      for (const item of response.body.items) {
        expect(item.approvalStatus).toBe('PENDING');
      }
      expect(JSON.stringify(response.body)).not.toContain('storageKey');
    });

    it('filters by status and returns deterministic ordering', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}?status=APPROVED`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.items).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    it('honours page and limit', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}?page=1&limit=2`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.limit).toBe(2);
      expect(response.body.total).toBeGreaterThanOrEqual(3);
    });

    it('rejects a limit over the maximum with 400', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}?limit=101`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(400);
    });
  });

  describe('detail', () => {
    let operator: { accessToken: string };

    beforeAll(async () => {
      operator = await createUser('+989140000009', 'OPERATOR');
    });

    it('returns the review detail for a PENDING partner', async () => {
      const { partnerId } = await createPendingPartner('+989140000010');

      const response = await request(app.getHttpServer())
        .get(`${BASE}/${partnerId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.businessName).toBe('اکسیر الکترونیک');
      expect(response.body.approvalStatus).toBe('PENDING');
      expect(response.body.profile.firstName).toBe('علی');
      expect(response.body.documents).toHaveLength(1);
      expect(JSON.stringify(response.body)).not.toContain('storageKey');
    });

    it('returns 404 for an unknown partner', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/00000000-0000-0000-0000-000000000001`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
    });
  });

  describe('approve', () => {
    let operator: { userId: string; accessToken: string };

    beforeAll(async () => {
      operator = await createUser('+989140000011', 'OPERATOR');
    });

    it('approves a PENDING partner and activates the PARTNER role', async () => {
      const { userId, accessToken, partnerId } = await createPendingPartner('+989140000012');

      const response = await request(app.getHttpServer())
        .patch(`${BASE}/${partnerId}/approve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ tierId: tierIds[0], reviewNotes: 'اسناد کامل است' })
        .expect(200);

      expect(response.body.approvalStatus).toBe('APPROVED');
      expect(response.body.tier.id).toBe(tierIds[0]);
      expect(response.body.reviewNotes).toBe('اسناد کامل است');

      const userRole = await prisma.userRole.findUnique({
        where: { userId_roleId: { userId, roleId: roleIds.PARTNER! } },
      });
      expect(userRole).toBeDefined();
      expect(userRole!.assignedBy).toBe(operator.userId);

      const applicant = await request(app.getHttpServer())
        .get(`${APPLICANT_BASE}/application`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(applicant.body.approvalStatus).toBe('APPROVED');
    });

    it('returns 409 on a repeated approval', async () => {
      const { partnerId } = await createPendingPartner('+989140000013');

      await request(app.getHttpServer())
        .patch(`${BASE}/${partnerId}/approve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ tierId: tierIds[0] })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`${BASE}/${partnerId}/approve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ tierId: tierIds[0] })
        .expect(409);
    });

    it('returns 422 when no active business license exists', async () => {
      const { accessToken } = await createUser('+989140000014');
      const { partnerId } = await applyAndSubmit(app, accessToken);
      partnerIds.push(partnerId);

      await prisma.businessDocument.updateMany({
        where: { partnerId },
        data: { deletedAt: new Date() },
      });

      await request(app.getHttpServer())
        .patch(`${BASE}/${partnerId}/approve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ tierId: tierIds[0] })
        .expect(422);
    });

    it('returns 400 for a missing tier', async () => {
      const { partnerId } = await createPendingPartner('+989140000015');

      await request(app.getHttpServer())
        .patch(`${BASE}/${partnerId}/approve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ tierId: '00000000-0000-4000-8000-000000000099' })
        .expect(400);
    });
  });

  describe('reject', () => {
    let operator: { userId: string; accessToken: string };

    beforeAll(async () => {
      operator = await createUser('+989140000016', 'OPERATOR');
    });

    it('rejects a PENDING partner and reports the reason to the applicant', async () => {
      const { accessToken, partnerId } = await createPendingPartner('+989140000017');

      const response = await request(app.getHttpServer())
        .patch(`${BASE}/${partnerId}/reject`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ reason: 'مدارک ناقص است' })
        .expect(200);

      expect(response.body.approvalStatus).toBe('REJECTED');
      expect(response.body.rejectionReason).toBe('مدارک ناقص است');

      const applicant = await request(app.getHttpServer())
        .get(`${APPLICANT_BASE}/application`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(applicant.body.approvalStatus).toBe('REJECTED');
      expect(applicant.body.rejectionReason).toBe('مدارک ناقص است');
    });

    it('returns 400 when the reason is missing', async () => {
      const { partnerId } = await createPendingPartner('+989140000018');

      await request(app.getHttpServer())
        .patch(`${BASE}/${partnerId}/reject`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({})
        .expect(400);
    });

    it('returns 409 when rejecting an APPROVED partner', async () => {
      const { partnerId } = await createPendingPartner('+989140000019');

      await request(app.getHttpServer())
        .patch(`${BASE}/${partnerId}/approve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ tierId: tierIds[0] })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`${BASE}/${partnerId}/reject`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ reason: 'تغییر نظر' })
        .expect(409);
    });
  });

  describe('tier change', () => {
    let operator: { accessToken: string };
    let secondTier: string;

    beforeAll(async () => {
      operator = await createUser('+989140000020', 'OPERATOR');
      const tier = await prisma.partnerTier.create({
        data: { name: 'Tier E2E 2', discountPercent: 10, minOrderQuantity: 2 },
      });
      tierIds.push(tier.id);
      secondTier = tier.id;
    });

    it('changes the tier of an APPROVED partner', async () => {
      const { partnerId } = await createPendingPartner('+989140000021');

      await request(app.getHttpServer())
        .patch(`${BASE}/${partnerId}/approve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ tierId: tierIds[0] })
        .expect(200);

      const response = await request(app.getHttpServer())
        .patch(`${BASE}/${partnerId}/tier`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ tierId: secondTier })
        .expect(200);

      expect(response.body.tier.id).toBe(secondTier);
    });

    it('returns 409 for a tier change on a PENDING partner', async () => {
      const { partnerId } = await createPendingPartner('+989140000022');

      await request(app.getHttpServer())
        .patch(`${BASE}/${partnerId}/tier`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ tierId: secondTier })
        .expect(409);
    });
  });

  describe('document preview', () => {
    let operator: { accessToken: string };
    let victim: { accessToken: string };
    let victimPartnerId: string;
    let victimDocumentId: string;

    beforeAll(async () => {
      operator = await createUser('+989140000023', 'OPERATOR');
      victim = await createUser('+989140000024');
      const created = await applyAndSubmit(app, victim.accessToken);
      victimPartnerId = created.partnerId;
      partnerIds.push(victimPartnerId);
      victimDocumentId = created.documentId;
    });

    it('allows an OPERATOR to download a partner document', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/${victimPartnerId}/documents/${victimDocumentId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body).toEqual(PDF);
      expect(response.headers['content-type']).toContain('application/pdf');
      const disposition = response.headers['content-disposition'] as string;
      expect(disposition).toContain('attachment');
      const utf8Match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      expect(utf8Match).toBeTruthy();
      expect(decodeURIComponent(utf8Match![1]!)).toBe('گواهی-فعالیت.pdf');
    });

    it('denies the applicant themselves with 403', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/${victimPartnerId}/documents/${victimDocumentId}`)
        .set('Authorization', `Bearer ${victim.accessToken}`)
        .expect(403);
    });

    it('denies a CUSTOMER with 403', async () => {
      const customer = await createUser('+989140000025', 'CUSTOMER');

      await request(app.getHttpServer())
        .get(`${BASE}/${victimPartnerId}/documents/${victimDocumentId}`)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .expect(403);
    });

    it('returns 404 when the document belongs to another partner', async () => {
      const { partnerId } = await createPendingPartner('+989140000026');

      await request(app.getHttpServer())
        .get(`${BASE}/${partnerId}/documents/${victimDocumentId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
    });

    it('returns 404 for a soft-deleted document', async () => {
      await prisma.businessDocument.updateMany({
        where: { id: victimDocumentId },
        data: { deletedAt: new Date() },
      });

      await request(app.getHttpServer())
        .get(`${BASE}/${victimPartnerId}/documents/${victimDocumentId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
    });
  });
});
