import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BASE = '/api/v1/admin/audit';
const USERS_BASE = '/api/v1/admin/users';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 90 + 10)}`;
}

describe('Admin audit query API (SS-064) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const seededAuditIds: string[] = [];
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
    await prisma.auditLog.deleteMany({ where: { id: { in: seededAuditIds } } });
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

  async function createUser(role?: string) {
    const mobile = uniqueMobile();
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
    const tokens = await tokenService.createSession(user.id);
    return {
      userId: user.id,
      mobile,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async function seedAudit(data: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    before?: Prisma.InputJsonValue | null;
    after?: Prisma.InputJsonValue | null;
    ipAddress?: string | null;
    createdAt?: Date;
  }): Promise<string> {
    const id = await prisma.auditLog.create({
      data: {
        userId: data.userId ?? null,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId ?? null,
        before:
          data.before === undefined || data.before === null
            ? Prisma.DbNull
            : data.before,
        after:
          data.after === undefined || data.after === null
            ? Prisma.DbNull
            : data.after,
        ipAddress: data.ipAddress ?? null,
        createdAt: data.createdAt,
      },
    });
    seededAuditIds.push(id.id);
    return id.id;
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
      expect(operatorResponse.body).toHaveProperty('items');
      expect(operatorResponse.body).toHaveProperty('total');

      const adminResponse = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(Array.isArray(adminResponse.body.items)).toBe(true);
    });
  });

  describe('real audit-producing workflows', () => {
    it('surfaces a USER_SUSPENDED entry produced by an OPERATOR', async () => {
      const operator = await createUser('OPERATOR');
      const target = await createUser('CUSTOMER');

      await request(app.getHttpServer())
        .patch(`${USERS_BASE}/${target.userId}/suspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ reason: 'تخلف' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(BASE)
        .query({ actorId: operator.userId, action: 'USER_SUSPENDED' })
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.total).toBe(1);
      const entry = response.body.items[0];
      expect(entry.userId).toBe(operator.userId);
      expect(entry.actor).toEqual({
        id: operator.userId,
        mobile: operator.mobile,
        firstName: 'علی',
        lastName: 'احمدی',
      });
      expect(entry.action).toBe('USER_SUSPENDED');
      expect(entry.entity).toBe('User');
      expect(entry.entityId).toBe(target.userId);
      expect(entry.before).toEqual({ status: 'ACTIVE' });
      expect(entry.after).toEqual({ status: 'SUSPENDED', reason: 'تخلف' });
      expect(entry.createdAt).toEqual(expect.any(String));
      expect(Date.parse(entry.createdAt)).not.toBeNaN();
    });

    it('surfaces a SESSION_CREATED entry filterable by entityId', async () => {
      const operator = await createUser('OPERATOR');
      const user = await createUser('CUSTOMER');
      const session = await prisma.userSession.findFirst({
        where: { userId: user.userId },
      });

      const response = await request(app.getHttpServer())
        .get(BASE)
        .query({ entityId: session!.id })
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.total).toBeGreaterThanOrEqual(1);
      for (const item of response.body.items) {
        expect(item.entity).toBe('UserSession');
        expect(item.entityId).toBe(session!.id);
      }
    });

    it('surfaces a ROLE_ASSIGNED entry produced by an ADMIN', async () => {
      const admin = await createUser('ADMIN');
      const target = await createUser('CUSTOMER');

      await request(app.getHttpServer())
        .put(`${USERS_BASE}/${target.userId}/roles/OPERATOR`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(BASE)
        .query({ actorId: admin.userId, action: 'ROLE_ASSIGNED' })
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0]!.entity).toBe('UserRole');
      expect(response.body.items[0]!.after).toEqual({ role: 'OPERATOR' });
    });
  });

  describe('filters and pagination', () => {
    it('paginates with deterministic ordering', async () => {
      const actor = await createUser('OPERATOR');
      const target = await createUser('CUSTOMER');
      const older = await seedAudit({
        userId: actor.userId,
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: target.userId,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      });
      const newer = await seedAudit({
        userId: actor.userId,
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: target.userId,
        createdAt: new Date('2026-08-10T00:00:00.000Z'),
      });

      const pageOne = await request(app.getHttpServer())
        .get(BASE)
        .query({ actorId: actor.userId, action: 'USER_SUSPENDED', page: 1, limit: 1 })
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(200);
      const pageTwo = await request(app.getHttpServer())
        .get(BASE)
        .query({ actorId: actor.userId, action: 'USER_SUSPENDED', page: 2, limit: 1 })
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(200);

      expect(pageOne.body.total).toBeGreaterThanOrEqual(2);
      expect(pageOne.body.items[0]!.id).toBe(newer);
      expect(pageTwo.body.items[0]!.id).toBe(older);
    });

    it('filters by an inclusive date range', async () => {
      const actor = await createUser('OPERATOR');
      await seedAudit({
        userId: actor.userId,
        action: 'PARTNER_TIER_CHANGED',
        entity: 'Partner',
        createdAt: new Date('2026-08-18T10:00:00.000Z'),
      });
      await seedAudit({
        userId: actor.userId,
        action: 'PARTNER_TIER_CHANGED',
        entity: 'Partner',
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
      });

      const response = await request(app.getHttpServer())
        .get(BASE)
        .query({
          actorId: actor.userId,
          action: 'PARTNER_TIER_CHANGED',
          from: '2026-08-18T00:00:00.000Z',
          to: '2026-08-18T23:59:59.999Z',
        })
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0]!.createdAt).toBe('2026-08-18T10:00:00.000Z');
    });

    it('combines filters with AND', async () => {
      const actor = await createUser('OPERATOR');
      const target = await createUser('CUSTOMER');
      await seedAudit({
        userId: actor.userId,
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: target.userId,
        createdAt: new Date('2026-08-18T10:00:00.000Z'),
      });
      await seedAudit({
        userId: actor.userId,
        action: 'USER_UNSUSPENDED',
        entity: 'User',
        entityId: target.userId,
        createdAt: new Date('2026-08-18T11:00:00.000Z'),
      });

      const response = await request(app.getHttpServer())
        .get(BASE)
        .query({
          actorId: actor.userId,
          action: 'USER_SUSPENDED',
          entity: 'User',
          entityId: target.userId,
        })
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0]!.action).toBe('USER_SUSPENDED');
    });

    it('returns an empty result for a non-matching filter', async () => {
      const operator = await createUser('OPERATOR');

      const response = await request(app.getHttpServer())
        .get(BASE)
        .query({ action: 'NOT_A_REAL_ACTION' })
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.total).toBe(0);
      expect(response.body.items).toHaveLength(0);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(20);
    });
  });

  describe('actor resolution edge cases', () => {
    it('returns actor null and the raw userId for a missing actor', async () => {
      const operator = await createUser('OPERATOR');
      const ghostId = '00000000-0000-0000-0000-000000000000';
      await seedAudit({
        userId: ghostId,
        action: 'ROLE_ASSIGNED',
        entity: 'UserRole',
        after: { role: 'ADMIN' },
      });

      const response = await request(app.getHttpServer())
        .get(BASE)
        .query({ actorId: ghostId })
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0]!.userId).toBe(ghostId);
      expect(response.body.items[0]!.actor).toBeNull();
    });

    it('resolves a soft-deleted actor normally', async () => {
      const operator = await createUser('OPERATOR');
      const viewer = await createUser('ADMIN');
      const target = await createUser('CUSTOMER');

      await request(app.getHttpServer())
        .patch(`${USERS_BASE}/${target.userId}/suspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({})
        .expect(200);

      await prisma.user.update({
        where: { id: operator.userId },
        data: { deletedAt: new Date() },
      });

      const response = await request(app.getHttpServer())
        .get(BASE)
        .query({ actorId: operator.userId, action: 'USER_SUSPENDED' })
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0]!.actor).toEqual({
        id: operator.userId,
        mobile: operator.mobile,
        firstName: 'علی',
        lastName: 'احمدی',
      });
    });
  });

  describe('validation and security', () => {
    it('rejects invalid query values with 400', async () => {
      const operator = await createUser('OPERATOR');
      const token = operator.accessToken;

      await request(app.getHttpServer())
        .get(BASE)
        .query({ actorId: 'not-a-uuid' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(BASE)
        .query({ entityId: 'not-a-uuid' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(BASE)
        .query({ from: 'not-a-date' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(BASE)
        .query({ to: 'not-a-date' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(BASE)
        .query({ from: '2026-W07' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(BASE)
        .query({ to: '2026-127' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(BASE)
        .query({ limit: 101 })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(BASE)
        .query({ page: 0 })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(BASE)
        .query({ from: '2026-08-31T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('never exposes sensitive data in responses', async () => {
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
    });
  });
});