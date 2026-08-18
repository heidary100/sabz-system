import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PartnerApprovalStatus, Prisma, UserStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BASE = '/api/v1/admin/dashboard';
const USERS_BASE = '/api/v1/admin/users';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

/**
 * The dashboard aggregates the whole database, and Jest runs the e2e spec
 * files in parallel workers against the same Postgres. Count assertions use
 * guaranteed lower bounds from this file's own seeds plus the documented
 * self-consistency invariant; recent-list assertions use explicit far-future
 * timestamps so seeded rows rank above any concurrently created rows.
 */
describe('Admin dashboard API (SS-065) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const partnerIds: string[] = [];
  const auditIds: string[] = [];
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
    await prisma.auditLog.deleteMany({ where: { id: { in: auditIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ entityId: { in: userIds } }, { userId: { in: userIds } }],
      },
    });
    await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
    await prisma.userSession.deleteMany({
      where: { user: { mobile: { in: mobiles } } },
    });
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  async function createUser(role?: string, status: UserStatus = UserStatus.ACTIVE) {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: { mobile, status },
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
      mobile,
      accessToken: tokens.accessToken,
    };
  }

  async function createPartner(status: PartnerApprovalStatus, submittedAt?: Date | null) {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: {
        mobile,
        status: UserStatus.ACTIVE,
        profile: { create: { firstName: 'فاطمه', lastName: 'کریمی' } },
      },
      include: { profile: true },
    });
    userIds.push(user.id);
    const partner = await prisma.partner.create({
      data: {
        profileId: user.profile!.id,
        businessName: `شرکت ${status} ${mobile.slice(-4)}`,
        approvalStatus: status,
        submittedAt: submittedAt === undefined ? new Date() : submittedAt,
      },
    });
    partnerIds.push(partner.id);
    return { id: partner.id };
  }

  async function seedAudit(
    userId: string | null,
    action: string,
    entity: string,
    createdAt?: Date,
    entityId?: string,
  ): Promise<string> {
    const id = await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        createdAt,
        before: Prisma.DbNull,
        after: Prisma.DbNull,
      },
    });
    auditIds.push(id.id);
    return id.id;
  }

  async function getDashboard(token: string) {
    const response = await request(app.getHttpServer())
      .get(BASE)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body;
  }

  describe('authentication and authorization', () => {
    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer()).get(BASE).expect(401);
    });

    it('rejects CUSTOMER and PARTNER with 403 and allows OPERATOR and ADMIN', async () => {
      const customer = await createUser('CUSTOMER');
      const partner = await createUser('PARTNER');
      const operator = await createUser('OPERATOR');
      const admin = await createUser('ADMIN');

      await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${partner.accessToken}`)
        .expect(403);

      const operatorResponse = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(operatorResponse.body).toHaveProperty('users');
      expect(operatorResponse.body).toHaveProperty('roles');
      expect(operatorResponse.body).toHaveProperty('partners');
      expect(operatorResponse.body).toHaveProperty('recentPartners');
      expect(operatorResponse.body).toHaveProperty('recentAudit');

      const adminResponse = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(adminResponse.body.users).toBeDefined();
    });
  });

  describe('response shape', () => {
    it('returns the full contract shape with numeric counts and bounded lists', async () => {
      const operator = await createUser('OPERATOR');
      const body = await getDashboard(operator.accessToken);

      expect(body.users).toEqual({
        total: expect.any(Number),
        active: expect.any(Number),
        suspended: expect.any(Number),
        locked: expect.any(Number),
        pendingOtp: expect.any(Number),
      });
      expect(body.roles).toEqual({
        customer: expect.any(Number),
        partner: expect.any(Number),
        operator: expect.any(Number),
        admin: expect.any(Number),
      });
      expect(body.partners).toEqual({
        draft: expect.any(Number),
        pending: expect.any(Number),
        approved: expect.any(Number),
        rejected: expect.any(Number),
      });
      expect(Array.isArray(body.recentPartners)).toBe(true);
      expect(body.recentPartners.length).toBeLessThanOrEqual(5);
      expect(Array.isArray(body.recentAudit)).toBe(true);
      expect(body.recentAudit.length).toBeLessThanOrEqual(8);

      if (body.recentPartners.length > 0) {
        expect(Date.parse(body.recentPartners[0].createdAt)).not.toBeNaN();
        expect(
          body.recentPartners[0].submittedAt === null ||
            !Number.isNaN(Date.parse(body.recentPartners[0].submittedAt)),
        ).toBe(true);
      }
      if (body.recentAudit.length > 0) {
        expect(Date.parse(body.recentAudit[0].createdAt)).not.toBeNaN();
      }
    });
  });

  describe('data correctness', () => {
    it('reflects user, role and partner counts with the documented invariants', async () => {
      const operator = await createUser('OPERATOR');

      await createUser('CUSTOMER', UserStatus.ACTIVE);
      await createUser(undefined, UserStatus.SUSPENDED);
      await createPartner(PartnerApprovalStatus.PENDING);
      const deleted = await createPartner(
        PartnerApprovalStatus.DRAFT,
        new Date(Date.now() + 6_000_000),
      );
      await prisma.partner.update({
        where: { id: deleted.id },
        data: { deletedAt: new Date() },
      });

      const body = await getDashboard(operator.accessToken);

      // Self-consistency invariant from the same snapshot: holds regardless of
      // concurrent workers.
      expect(body.users.total).toBe(
        body.users.active + body.users.suspended + body.users.locked + body.users.pendingOtp,
      );

      // Lower bounds from this file's own seeds: parallel workers only add
      // rows, and our rows are only removed by this file's cleanup.
      expect(body.users.active).toBeGreaterThanOrEqual(2);
      expect(body.users.suspended).toBeGreaterThanOrEqual(1);
      expect(body.roles.customer).toBeGreaterThanOrEqual(1);
      expect(body.partners.pending).toBeGreaterThanOrEqual(1);

      // Soft-delete exclusion: the deleted partner has the newest submittedAt,
      // so its absence from recent applications proves the `deletedAt: null`
      // filter applies.
      const ids = body.recentPartners.map((partner: { id: string }) => partner.id);
      expect(ids).not.toContain(deleted.id);
    });

    it('surfaces recent partners ordered by submittedAt DESC', async () => {
      const operator = await createUser('OPERATOR');
      const base = Date.now() + 1_000_000;
      // Only PENDING partners: the shared-DB admin-partners review suite
      // asserts that the APPROVED status filter returns zero rows, so this
      // spec must not create APPROVED/REJECTED partners.
      const older = await createPartner(PartnerApprovalStatus.PENDING, new Date(base));
      const middle = await createPartner(PartnerApprovalStatus.PENDING, new Date(base + 1_000));
      const newest = await createPartner(PartnerApprovalStatus.PENDING, new Date(base + 2_000));

      const body = await getDashboard(operator.accessToken);
      const ids = body.recentPartners.map((partner: { id: string }) => partner.id);

      expect(ids.indexOf(newest.id)).toBeLessThan(ids.indexOf(middle.id));
      expect(ids.indexOf(middle.id)).toBeLessThan(ids.indexOf(older.id));
    });

    it('surfaces recent audit entries with resolved actors', async () => {
      const operator = await createUser('OPERATOR');
      const target = await createUser('CUSTOMER');
      const auditId = await seedAudit(
        operator.userId,
        'USER_SUSPENDED',
        'User',
        new Date(Date.now() + 2_000_000),
        target.userId,
      );

      const body = await getDashboard(operator.accessToken);
      const entry = body.recentAudit.find((item: { id: string }) => item.id === auditId);

      expect(entry).toBeDefined();
      expect(entry.action).toBe('USER_SUSPENDED');
      expect(entry.entity).toBe('User');
      expect(entry.entityId).toBe(target.userId);
      expect(entry.userId).toBe(operator.userId);
      expect(entry.actor).toEqual({
        id: operator.userId,
        mobile: operator.mobile,
        firstName: 'علی',
        lastName: 'احمدی',
      });
    });
  });

  describe('validation and security', () => {
    it('never exposes sensitive data in the response', async () => {
      const operator = await createUser('OPERATOR');
      const target = await createUser('CUSTOMER');

      await request(app.getHttpServer())
        .patch(`${USERS_BASE}/${target.userId}/suspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({})
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('tokenHash');
      expect(serialized).not.toContain('sessionId');
      expect(serialized).not.toContain('storageKey');
      expect(serialized).not.toContain('nationalId');
      expect(serialized).not.toContain('businessLicenseNo');
      expect(serialized).not.toContain('reviewNotes');
      expect(serialized).not.toContain('rejectionReason');
      expect(serialized).not.toContain('before');
      expect(serialized).not.toContain('after');
      expect(serialized).not.toContain('ipAddress');
    });

    it('recent audit items expose no payload or ip fields', async () => {
      const operator = await createUser('OPERATOR');
      const body = await getDashboard(operator.accessToken);

      if (body.recentAudit.length > 0) {
        const item = body.recentAudit[0];
        expect(item).not.toHaveProperty('before');
        expect(item).not.toHaveProperty('after');
        expect(item).not.toHaveProperty('ipAddress');
      }
    });
  });
});
