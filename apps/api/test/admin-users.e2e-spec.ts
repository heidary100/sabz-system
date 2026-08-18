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
const AUTH_BASE = '/api/v1/auth';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 90 + 10)}`;
}

describe('Admin user lifecycle API (SS-062) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const roleIds: Record<string, string> = {};

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
      const row = await prisma.role.upsert({
        where: { name: role },
        update: {},
        create: { name: role },
      });
      roleIds[role] = row.id;
    }
  });

  afterAll(async () => {
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

  async function createUser(
    role?: string,
    options: { status?: UserStatus } = {},
  ) {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: { mobile, status: options.status ?? UserStatus.ACTIVE },
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
      refreshToken: tokens.refreshToken,
    };
  }

  async function countActiveAdmins(): Promise<number> {
    return prisma.user.count({
      where: {
        status: UserStatus.ACTIVE,
        deletedAt: null,
        roles: { some: { role: { name: 'ADMIN' } } },
      },
    });
  }

  describe('authentication and authorization', () => {
    it('rejects every endpoint without a token with 401', async () => {
      const id = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .patch(`${BASE}/${id}/suspend`)
        .send({})
        .expect(401);
      await request(app.getHttpServer())
        .patch(`${BASE}/${id}/unsuspend`)
        .expect(401);
      await request(app.getHttpServer())
        .patch(`${BASE}/${id}/unlock`)
        .expect(401);
    });

    it('rejects CUSTOMER with 403', async () => {
      const { accessToken } = await createUser('CUSTOMER');
      const id = '00000000-0000-0000-0000-000000000000';
      for (const path of ['suspend', 'unsuspend', 'unlock']) {
        await request(app.getHttpServer())
          .patch(`${BASE}/${id}/${path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(403);
      }
    });

    it('rejects PARTNER with 403', async () => {
      const { accessToken } = await createUser('PARTNER');
      const id = '00000000-0000-0000-0000-000000000000';
      for (const path of ['suspend', 'unsuspend', 'unlock']) {
        await request(app.getHttpServer())
          .patch(`${BASE}/${id}/${path}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(403);
      }
    });

    it('allows OPERATOR to suspend and unsuspend but denies unlock', async () => {
      const operator = await createUser('OPERATOR');
      const target = await createUser('CUSTOMER');
      const locked = await createUser('CUSTOMER', { status: UserStatus.LOCKED });

      await request(app.getHttpServer())
        .patch(`${BASE}/${target.userId}/suspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ reason: 'تخلف' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`${BASE}/${target.userId}/unsuspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`${BASE}/${locked.userId}/unlock`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(403);
    });

    it('allows ADMIN to suspend, unsuspend and unlock', async () => {
      const admin = await createUser('ADMIN');
      const active = await createUser('CUSTOMER');
      const locked = await createUser('CUSTOMER', { status: UserStatus.LOCKED });

      await request(app.getHttpServer())
        .patch(`${BASE}/${active.userId}/suspend`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(200);

      await request(app.getHttpServer())
        .patch(`${BASE}/${active.userId}/unsuspend`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`${BASE}/${locked.userId}/unlock`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
    });

    it('denies an OPERATOR suspending an ADMIN target with 403', async () => {
      const operator = await createUser('OPERATOR');
      const admin = await createUser('ADMIN');

      await request(app.getHttpServer())
        .patch(`${BASE}/${admin.userId}/suspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({})
        .expect(403);
    });
  });

  describe('suspend → refresh failure → unsuspend flow', () => {
    it('suspends, blocks refresh, then unsuspends', async () => {
      const operator = await createUser('OPERATOR');
      const target = await createUser('CUSTOMER');

      const suspended = await request(app.getHttpServer())
        .patch(`${BASE}/${target.userId}/suspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ reason: 'تخلف در فروش' })
        .expect(200);
      expect(suspended.body.status).toBe('SUSPENDED');

      const detail = await request(app.getHttpServer())
        .get(`${BASE}/${target.userId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(detail.body.status).toBe('SUSPENDED');

      await request(app.getHttpServer())
        .post(`${AUTH_BASE}/refresh`)
        .send({ refreshToken: target.refreshToken })
        .expect(401);

      const audits = await prisma.auditLog.findMany({
        where: { entityId: target.userId, action: 'USER_SUSPENDED' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]!.userId).toBe(operator.userId);

      const unsuspended = await request(app.getHttpServer())
        .patch(`${BASE}/${target.userId}/unsuspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(unsuspended.body.status).toBe('ACTIVE');
    });
  });

  describe('ADMIN unlock flow', () => {
    it('unlocks a LOCKED user and audits the change', async () => {
      const admin = await createUser('ADMIN');
      const target = await createUser('CUSTOMER', { status: UserStatus.LOCKED });

      const response = await request(app.getHttpServer())
        .patch(`${BASE}/${target.userId}/unlock`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(response.body.status).toBe('ACTIVE');

      const audits = await prisma.auditLog.findMany({
        where: { entityId: target.userId, action: 'USER_UNLOCKED' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]!.userId).toBe(admin.userId);
    });
  });

  describe('guard rails', () => {
    let operator: { userId: string; accessToken: string };

    beforeAll(async () => {
      operator = await createUser('OPERATOR');
    });

    it('forbids self-suspension with 409', async () => {
      const admin = await createUser('ADMIN');

      await request(app.getHttpServer())
        .patch(`${BASE}/${admin.userId}/suspend`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(409);
    });

    it('protects the last active ADMIN from losing active-admin coverage', async () => {
      const admin = await createUser('ADMIN');
      const operator = await createUser('OPERATOR');

      // The OPERATOR-vs-ADMIN restriction keeps an OPERATOR from deactivating
      // an ADMIN account (403), and self-suspension (409) keeps the last ADMIN
      // from removing themselves. Together these preserve at least one active
      // ADMIN through the public API. The last-active-ADMIN guard itself is
      // exercised deterministically in the database integration suite.
      await request(app.getHttpServer())
        .patch(`${BASE}/${admin.userId}/suspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({})
        .expect(403);

      await request(app.getHttpServer())
        .patch(`${BASE}/${admin.userId}/suspend`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(409);

      expect(await countActiveAdmins()).toBeGreaterThanOrEqual(1);
    });

    it('returns 409 for an invalid status transition', async () => {
      const activeTarget = await createUser('CUSTOMER');
      const secondTarget = await createUser('CUSTOMER');

      await request(app.getHttpServer())
        .patch(`${BASE}/${activeTarget.userId}/suspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({})
        .expect(200);

      await request(app.getHttpServer())
        .patch(`${BASE}/${activeTarget.userId}/suspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({})
        .expect(409);

      await request(app.getHttpServer())
        .patch(`${BASE}/${secondTarget.userId}/unsuspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(409);
    });

    it('returns 404 for a soft-deleted target', async () => {
      const target = await createUser('CUSTOMER');
      await prisma.user.update({
        where: { id: target.userId },
        data: { deletedAt: new Date() },
      });

      await request(app.getHttpServer())
        .patch(`${BASE}/${target.userId}/suspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({})
        .expect(404);
    });

    it('returns 404 for an invalid UUID', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/not-a-uuid/suspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({})
        .expect(404);
    });

    it('rejects an oversized suspension reason with 400', async () => {
      const target = await createUser('CUSTOMER');

      await request(app.getHttpServer())
        .patch(`${BASE}/${target.userId}/suspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ reason: 'x'.repeat(501) })
        .expect(400);
    });

    it('never returns sensitive fields in lifecycle responses', async () => {
      const target = await createUser('CUSTOMER');

      const response = await request(app.getHttpServer())
        .patch(`${BASE}/${target.userId}/suspend`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({})
        .expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('sessionId');
    });
  });

  describe('role administration API (SS-063)', () => {
    const ROLES_BASE = '/api/v1/admin/roles';

    describe('authorization', () => {
      it('rejects the role routes without a token with 401', async () => {
        const id = '00000000-0000-0000-0000-000000000000';
        await request(app.getHttpServer()).get(ROLES_BASE).expect(401);
        await request(app.getHttpServer())
          .put(`${BASE}/${id}/roles/OPERATOR`)
          .expect(401);
        await request(app.getHttpServer())
          .delete(`${BASE}/${id}/roles/OPERATOR`)
          .expect(401);
      });

      it('rejects CUSTOMER, PARTNER and OPERATOR with 403 and allows ADMIN', async () => {
        const customer = await createUser('CUSTOMER');
        const partner = await createUser('PARTNER');
        const operator = await createUser('OPERATOR');
        const admin = await createUser('ADMIN');
        const target = await createUser('CUSTOMER');

        for (const token of [customer, partner, operator]) {
          await request(app.getHttpServer())
            .get(ROLES_BASE)
            .set('Authorization', `Bearer ${token.accessToken}`)
            .expect(403);
          await request(app.getHttpServer())
            .put(`${BASE}/${target.userId}/roles/OPERATOR`)
            .set('Authorization', `Bearer ${token.accessToken}`)
            .expect(403);
          await request(app.getHttpServer())
            .delete(`${BASE}/${target.userId}/roles/OPERATOR`)
            .set('Authorization', `Bearer ${token.accessToken}`)
            .expect(403);
        }

        await request(app.getHttpServer())
          .get(ROLES_BASE)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200);
      });
    });

    describe('role listing', () => {
      it('returns all roles with permissions and no internal fields', async () => {
        const admin = await createUser('ADMIN');

        const response = await request(app.getHttpServer())
          .get(ROLES_BASE)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200);

        const names = response.body.map((role: { name: string }) => role.name).sort();
        expect(names).toEqual(['ADMIN', 'CUSTOMER', 'OPERATOR', 'PARTNER'].sort());
        for (const role of response.body as Array<Record<string, unknown>>) {
          expect(role).toHaveProperty('id');
          expect(role).toHaveProperty('name');
          expect(role).toHaveProperty('description');
          expect(role).toHaveProperty('permissions');
          expect(Array.isArray(role.permissions)).toBe(true);
        }
        const serialized = JSON.stringify(response.body);
        expect(serialized).not.toContain('passwordHash');
        expect(serialized).not.toContain('refreshToken');
      });
    });

    describe('assignment and removal flows', () => {
      it('assigns OPERATOR, then PARTNER while preserving existing roles', async () => {
        const admin = await createUser('ADMIN');
        const target = await createUser('CUSTOMER');

        const assigned = await request(app.getHttpServer())
          .put(`${BASE}/${target.userId}/roles/OPERATOR`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200);
        expect(
          assigned.body.roles.some((role: { name: string }) => role.name === 'OPERATOR'),
        ).toBe(true);

        await request(app.getHttpServer())
          .put(`${BASE}/${target.userId}/roles/PARTNER`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200);

        const detail = await request(app.getHttpServer())
          .get(`${BASE}/${target.userId}`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200);
        const names = detail.body.roles.map((role: { name: string }) => role.name).sort();
        expect(names).toEqual(['CUSTOMER', 'OPERATOR', 'PARTNER'].sort());
      });

      it('is idempotent on duplicate assignment', async () => {
        const admin = await createUser('ADMIN');
        const target = await createUser('CUSTOMER');

        await request(app.getHttpServer())
          .put(`${BASE}/${target.userId}/roles/OPERATOR`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200);
        await request(app.getHttpServer())
          .put(`${BASE}/${target.userId}/roles/OPERATOR`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200);

        const audits = await prisma.auditLog.findMany({
          where: { entityId: target.userId, action: 'ROLE_ASSIGNED' },
        });
        expect(audits).toHaveLength(1);
      });

      it('removes PARTNER while keeping the remaining roles', async () => {
        const admin = await createUser('ADMIN');
        const target = await createUser('CUSTOMER');
        await prisma.userRole.create({
          data: {
            userId: target.userId,
            roleId: roleIds['PARTNER']!,
            assignedBy: admin.userId,
          },
        });

        const removed = await request(app.getHttpServer())
          .delete(`${BASE}/${target.userId}/roles/PARTNER`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200);
        expect(
          removed.body.roles.some((role: { name: string }) => role.name === 'PARTNER'),
        ).toBe(false);
        expect(
          removed.body.roles.some((role: { name: string }) => role.name === 'CUSTOMER'),
        ).toBe(true);
      });

      it('returns 200 unchanged when removing an already-absent role', async () => {
        const admin = await createUser('ADMIN');
        const target = await createUser('CUSTOMER');

        const response = await request(app.getHttpServer())
          .delete(`${BASE}/${target.userId}/roles/OPERATOR`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200);
        expect(response.body.id).toBe(target.userId);

        const audits = await prisma.auditLog.findMany({
          where: { entityId: target.userId, action: 'ROLE_REMOVED' },
        });
        expect(audits).toHaveLength(0);
      });

      it('assigns ADMIN to another user', async () => {
        const admin = await createUser('ADMIN');
        const target = await createUser('CUSTOMER');

        const assigned = await request(app.getHttpServer())
          .put(`${BASE}/${target.userId}/roles/ADMIN`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200);
        expect(
          assigned.body.roles.some((role: { name: string }) => role.name === 'ADMIN'),
        ).toBe(true);

        const audits = await prisma.auditLog.findMany({
          where: { entityId: target.userId, action: 'ROLE_ASSIGNED' },
        });
        expect(audits).toHaveLength(1);
        expect(audits[0]!.after).toEqual({ role: 'ADMIN' });
      });

      it('denies self role modification with 403', async () => {
        const admin = await createUser('ADMIN');

        await request(app.getHttpServer())
          .put(`${BASE}/${admin.userId}/roles/OPERATOR`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(403);
        await request(app.getHttpServer())
          .delete(`${BASE}/${admin.userId}/roles/OPERATOR`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(403);
      });

      it('denies ADMIN-role removal with 403', async () => {
        const admin = await createUser('ADMIN');
        const targetAdmin = await createUser('ADMIN');

        await request(app.getHttpServer())
          .delete(`${BASE}/${targetAdmin.userId}/roles/ADMIN`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(403);
      });

      it('returns 404 for a soft-deleted target', async () => {
        const admin = await createUser('ADMIN');
        const target = await createUser('CUSTOMER');
        await prisma.user.update({
          where: { id: target.userId },
          data: { deletedAt: new Date() },
        });

        await request(app.getHttpServer())
          .put(`${BASE}/${target.userId}/roles/OPERATOR`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(404);
        await request(app.getHttpServer())
          .delete(`${BASE}/${target.userId}/roles/OPERATOR`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(404);
      });

      it('returns 404 for a non-UUID id and 400 for an invalid role', async () => {
        const admin = await createUser('ADMIN');

        await request(app.getHttpServer())
          .put(`${BASE}/not-a-uuid/roles/OPERATOR`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(404);
        await request(app.getHttpServer())
          .put(`${BASE}/00000000-0000-0000-0000-000000000000/roles/MAYOR`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(400);
        await request(app.getHttpServer())
          .delete(`${BASE}/00000000-0000-0000-0000-000000000000/roles/MAYOR`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(400);
      });

      it('writes audit entries and never returns sensitive data', async () => {
        const admin = await createUser('ADMIN');
        const target = await createUser('CUSTOMER');

        const response = await request(app.getHttpServer())
          .put(`${BASE}/${target.userId}/roles/OPERATOR`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .expect(200);

        const serialized = JSON.stringify(response.body);
        expect(serialized).not.toContain('passwordHash');
        expect(serialized).not.toContain('refreshToken');
        expect(serialized).not.toContain('sessionId');

        const audits = await prisma.auditLog.findMany({
          where: { entityId: target.userId, action: 'ROLE_ASSIGNED' },
        });
        expect(audits).toHaveLength(1);
        expect(audits[0]!.userId).toBe(admin.userId);
        expect(audits[0]!.entity).toBe('UserRole');
        expect(JSON.stringify(audits[0])).not.toContain('passwordHash');
        expect(JSON.stringify(audits[0])).not.toContain('refreshToken');
      });
    });
  });
});
