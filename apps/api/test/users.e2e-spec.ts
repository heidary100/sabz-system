import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BASE = '/api/v1/admin/users';

describe('Admin user read API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const mobiles: string[] = [];
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

    for (const role of ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN']) {
      roleIds[role] = await seedRole(role);
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  async function createUser(
    mobile: string,
    options: {
      role?: string;
      firstName?: string;
      lastName?: string;
      status?: UserStatus;
      partner?: { businessName: string };
    } = {},
  ) {
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: {
        mobile,
        status: options.status ?? UserStatus.ACTIVE,
        profile: {
          create: {
            firstName: options.firstName ?? 'علی',
            lastName: options.lastName ?? 'احمدی',
            ...(options.partner
              ? {
                  partner: {
                    create: {
                      businessName: options.partner.businessName,
                    },
                  },
                }
              : {}),
          },
        },
      },
    });
    if (options.role) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: roleIds[options.role]!,
          assignedBy: user.id,
        },
      });
    }
    const tokenService = app.get(TokenService);
    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, accessToken: tokens.accessToken };
  }

  describe('authentication and authorization', () => {
    it('rejects every endpoint without a token with 401', async () => {
      await request(app.getHttpServer()).get(`${BASE}`).expect(401);
      await request(app.getHttpServer())
        .get(`${BASE}/00000000-0000-0000-0000-000000000000`)
        .expect(401);
    });

    it('rejects CUSTOMER with 403', async () => {
      const { accessToken } = await createUser('+989141000001', { role: 'CUSTOMER' });

      await request(app.getHttpServer())
        .get(`${BASE}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`${BASE}/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('rejects PARTNER with 403', async () => {
      const { accessToken } = await createUser('+989141000002', { role: 'PARTNER' });

      await request(app.getHttpServer())
        .get(`${BASE}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('allows OPERATOR', async () => {
      const { accessToken } = await createUser('+989141000003', { role: 'OPERATOR' });

      const response = await request(app.getHttpServer())
        .get(`${BASE}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        items: expect.any(Array),
        total: expect.any(Number),
        page: 1,
        limit: 20,
      });
    });

    it('allows ADMIN', async () => {
      const { accessToken } = await createUser('+989141000004', { role: 'ADMIN' });

      await request(app.getHttpServer())
        .get(`${BASE}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe('list', () => {
    let operator: { accessToken: string };

    beforeAll(async () => {
      operator = await createUser('+989141000005', { role: 'OPERATOR' });
    });

    it('searches by mobile with a partial match', async () => {
      await createUser('+989141000006', { firstName: 'نرگس', lastName: 'احمدی' });

      const response = await request(app.getHttpServer())
        .get(`${BASE}?search=141000006`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0].mobile).toBe('+989141000006');
      expect(response.body.items[0].profile.firstName).toBe('نرگس');
    });

    it('searches by first name', async () => {
      await createUser('+989141000007', { firstName: 'سامان', lastName: 'کریمی' });

      const response = await request(app.getHttpServer())
        .get(`${BASE}?search=سامان`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.total).toBeGreaterThanOrEqual(1);
      expect(
        response.body.items.some(
          (item: { profile: { firstName: string } }) =>
            item.profile.firstName === 'سامان',
        ),
      ).toBe(true);
    });

    it('searches by last name', async () => {
      await createUser('+989141000008', { firstName: 'مهسا', lastName: 'فرهادی' });

      const response = await request(app.getHttpServer())
        .get(`${BASE}?search=فرهادی`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.total).toBeGreaterThanOrEqual(1);
      expect(
        response.body.items.some(
          (item: { profile: { lastName: string } }) =>
            item.profile.lastName === 'فرهادی',
        ),
      ).toBe(true);
    });

    it('filters by status', async () => {
      await createUser('+989141000009', {
        firstName: 'پدرام',
        lastName: 'نوری',
        status: UserStatus.SUSPENDED,
      });

      const response = await request(app.getHttpServer())
        .get(`${BASE}?status=SUSPENDED`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.total).toBeGreaterThanOrEqual(1);
      for (const item of response.body.items) {
        expect(item.status).toBe('SUSPENDED');
      }
    });

    it('filters by role', async () => {
      await createUser('+989141000010', { firstName: 'کاوه', lastName: 'بهرامی' });
      await prisma.userRole.create({
        data: {
          userId: (
            await prisma.user.findUniqueOrThrow({
              where: { mobile: '+989141000010' },
            })
          ).id,
          roleId: roleIds.OPERATOR!,
          assignedBy: 'system',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`${BASE}?role=OPERATOR`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.total).toBeGreaterThanOrEqual(2);
      for (const item of response.body.items) {
        expect(item.roles).toContain('OPERATOR');
      }
    });

    it('combines search, status and role filters', async () => {
      await createUser('+989141000011', {
        firstName: 'رضا',
        lastName: 'موسوی',
        status: UserStatus.ACTIVE,
      });
      await prisma.userRole.create({
        data: {
          userId: (
            await prisma.user.findUniqueOrThrow({
              where: { mobile: '+989141000011' },
            })
          ).id,
          roleId: roleIds.CUSTOMER!,
          assignedBy: 'system',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`${BASE}?search=موسوی&status=ACTIVE&role=CUSTOMER`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0].mobile).toBe('+989141000011');
    });

    it('honours page and limit', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}?page=1&limit=2`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.limit).toBe(2);
      expect(response.body.page).toBe(1);
    });

    it('returns an empty page shape for an unmatched filter', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}?search=no-such-user-xyz`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    });

    it('rejects a limit over the maximum with 400', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}?limit=101`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(400);
    });

    it('rejects an invalid status with 400', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}?status=NOT_A_STATUS`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(400);
    });

    it('rejects an invalid role with 400', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}?role=PWNED`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(400);
    });

    it('strips unknown query parameters', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}?foo=bar&page=1`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.page).toBe(1);
    });

    it('excludes soft-deleted users from the list', async () => {
      const user = await createUser('+989141000012', {
        firstName: 'آرش',
        lastName: 'شریفی',
      });
      await prisma.user.update({
        where: { id: user.userId },
        data: { deletedAt: new Date() },
      });

      const response = await request(app.getHttpServer())
        .get(`${BASE}?search=آرش`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.total).toBe(0);
    });

    it('includes a partner summary when the user has a partner', async () => {
      await createUser('+989141000013', {
        firstName: 'بابک',
        lastName: 'سلطانی',
        partner: { businessName: 'الکترونیک شرق' },
      });

      const response = await request(app.getHttpServer())
        .get(`${BASE}?search=بابک`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0].partner).toMatchObject({
        businessName: 'الکترونیک شرق',
        approvalStatus: 'DRAFT',
      });
    });

    it('never returns sensitive fields in the list response', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('sessionId');
    });
  });

  describe('detail', () => {
    let operator: { accessToken: string };

    beforeAll(async () => {
      operator = await createUser('+989141000014', { role: 'OPERATOR' });
    });

    it('returns the full detail for an existing user', async () => {
      const { userId } = await createUser('+989141000015', {
        firstName: 'گلنار',
        lastName: 'احمدی',
        role: 'CUSTOMER',
      });

      const response = await request(app.getHttpServer())
        .get(`${BASE}/${userId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: userId,
        mobile: '+989141000015',
        status: 'ACTIVE',
        profile: { firstName: 'گلنار', lastName: 'احمدی' },
        roles: [{ name: 'CUSTOMER', assignedAt: expect.any(String) }],
        partner: null,
        lastLoginAt: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(response.body.email).toBeNull();
    });

    it('returns a partner summary on the detail', async () => {
      const { userId } = await createUser('+989141000016', {
        firstName: 'هومن',
        lastName: 'نجفی',
        role: 'PARTNER',
        partner: { businessName: 'کالای الکترونیک' },
      });

      const response = await request(app.getHttpServer())
        .get(`${BASE}/${userId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.partner).toMatchObject({
        businessName: 'کالای الکترونیک',
        approvalStatus: 'DRAFT',
      });
    });

    it('returns 404 for a soft-deleted user', async () => {
      const { userId } = await createUser('+989141000017', {
        firstName: 'مینا',
        lastName: 'تقوی',
      });
      await prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      });

      await request(app.getHttpServer())
        .get(`${BASE}/${userId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
    });

    it('returns 404 for an unknown user', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/00000000-0000-0000-0000-000000000001`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
    });

    it('returns 404 for an invalid UUID', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/not-a-uuid`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
    });

    it('never returns sensitive fields in the detail response', async () => {
      const { userId } = await createUser('+989141000018', {
        firstName: 'سیاوش',
        lastName: 'زارع',
      });

      const response = await request(app.getHttpServer())
        .get(`${BASE}/${userId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('sessionId');
    });
  });
});