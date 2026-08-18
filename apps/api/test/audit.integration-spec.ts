import { UserStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';

jest.setTimeout(30_000);

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function uniqueUuid(): string {
  return crypto.randomUUID();
}

describe('Admin audit query API database integration (SS-064)', () => {
  let prisma: PrismaService;
  let service: AuditService;

  const createdMobiles: string[] = [];
  const createdUserIds: string[] = [];
  const createdAuditIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new AuditService(prisma);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: createdUserIds } },
          { userId: { in: createdUserIds } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { mobile: { in: createdMobiles } } });
    await prisma.$disconnect();
  });

  async function createUser(): Promise<{
    id: string;
    mobile: string;
    firstName: string;
    lastName: string;
  }> {
    const mobile = uniqueMobile();
    createdMobiles.push(mobile);
    const user = await prisma.user.create({
      data: {
        mobile,
        status: UserStatus.ACTIVE,
        profile: {
          create: { firstName: 'علی', lastName: 'احمدی' },
        },
      },
      include: { profile: true },
    });
    createdUserIds.push(user.id);
    return {
      id: user.id,
      mobile: user.mobile,
      firstName: user.profile!.firstName,
      lastName: user.profile!.lastName,
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
    createdAuditIds.push(id.id);
    return id.id;
  }

  describe('list', () => {
    it('orders by createdAt DESC then id DESC with pagination', async () => {
      const actor = await createUser();
      const target = await createUser();
      const firstId = await seedAudit({
        userId: actor.id,
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: target.id,
        before: { status: 'ACTIVE' },
        after: { status: 'SUSPENDED' },
        createdAt: new Date('2026-08-18T10:00:00.000Z'),
      });
      const secondId = await seedAudit({
        userId: actor.id,
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: target.id,
        before: { status: 'ACTIVE' },
        after: { status: 'SUSPENDED' },
        createdAt: new Date('2026-08-18T12:00:00.000Z'),
      });

      const pageOne = await service.list({ actorId: actor.id, page: 1, limit: 1 });
      const pageTwo = await service.list({ actorId: actor.id, page: 2, limit: 1 });

      expect(pageOne.total).toBe(2);
      expect(pageOne.items).toHaveLength(1);
      expect(pageTwo.items).toHaveLength(1);
      expect(pageOne.items[0]!.id).toBe(secondId);
      expect(pageTwo.items[0]!.id).toBe(firstId);
    });

    it('filters by actorId', async () => {
      const firstActor = await createUser();
      const secondActor = await createUser();
      await seedAudit({
        userId: firstActor.id,
        action: 'ROLE_ASSIGNED',
        entity: 'UserRole',
        after: { role: 'OPERATOR' },
      });
      await seedAudit({
        userId: secondActor.id,
        action: 'ROLE_ASSIGNED',
        entity: 'UserRole',
        after: { role: 'OPERATOR' },
      });

      const result = await service.list({ actorId: firstActor.id });

      expect(result.total).toBe(1);
      expect(result.items[0]!.userId).toBe(firstActor.id);
      expect(result.items[0]!.actor?.id).toBe(firstActor.id);
    });

    it('filters by action with exact equality', async () => {
      const actor = await createUser();
      await seedAudit({
        userId: actor.id,
        action: 'USER_SUSPENDED',
        entity: 'User',
      });
      await seedAudit({
        userId: actor.id,
        action: 'USER_UNSUSPENDED',
        entity: 'User',
      });

      const result = await service.list({ actorId: actor.id, action: 'USER_SUSPENDED' });

      expect(result.total).toBe(1);
      expect(result.items[0]!.action).toBe('USER_SUSPENDED');
    });

    it('filters by entity with exact equality', async () => {
      const actor = await createUser();
      await seedAudit({ userId: actor.id, action: 'SESSION_CREATED', entity: 'UserSession' });
      await seedAudit({ userId: actor.id, action: 'PROFILE_UPDATE', entity: 'UserProfile' });

      const result = await service.list({ actorId: actor.id, entity: 'UserSession' });

      expect(result.total).toBe(1);
      expect(result.items[0]!.entity).toBe('UserSession');
    });

    it('filters by entityId with exact equality', async () => {
      const actor = await createUser();
      const firstTarget = await createUser();
      const secondTarget = await createUser();
      await seedAudit({
        userId: actor.id,
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: firstTarget.id,
      });
      await seedAudit({
        userId: actor.id,
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: secondTarget.id,
      });

      const result = await service.list({ entityId: firstTarget.id });

      expect(result.total).toBe(1);
      expect(result.items[0]!.entityId).toBe(firstTarget.id);
    });

    it('filters by an inclusive date range', async () => {
      const actor = await createUser();
      await seedAudit({
        userId: actor.id,
        action: 'OTP_VERIFIED',
        entity: 'User',
        after: { mobile: actor.mobile },
        createdAt: new Date('2026-08-18T10:00:00.000Z'),
      });
      await seedAudit({
        userId: actor.id,
        action: 'OTP_VERIFIED',
        entity: 'User',
        after: { mobile: actor.mobile },
        createdAt: new Date('2026-08-19T10:00:00.000Z'),
      });

      const exactDay = await service.list({
        actorId: actor.id,
        action: 'OTP_VERIFIED',
        from: '2026-08-18T00:00:00.000Z',
        to: '2026-08-18T23:59:59.999Z',
      });
      expect(exactDay.total).toBe(1);
      expect(exactDay.items[0]!.createdAt).toBe('2026-08-18T10:00:00.000Z');

      const fromOnly = await service.list({
        actorId: actor.id,
        action: 'OTP_VERIFIED',
        from: '2026-08-19T00:00:00.000Z',
      });
      expect(fromOnly.total).toBe(1);
      expect(fromOnly.items[0]!.createdAt).toBe('2026-08-19T10:00:00.000Z');

      const toOnly = await service.list({
        actorId: actor.id,
        action: 'OTP_VERIFIED',
        to: '2026-08-18T23:59:59.999Z',
      });
      expect(toOnly.total).toBe(1);
      expect(toOnly.items[0]!.createdAt).toBe('2026-08-18T10:00:00.000Z');
    });

    it('combines filters with AND', async () => {
      const actor = await createUser();
      const target = await createUser();
      const otherTarget = await createUser();
      await seedAudit({
        userId: actor.id,
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: target.id,
        createdAt: new Date('2026-08-18T10:00:00.000Z'),
      });
      await seedAudit({
        userId: actor.id,
        action: 'USER_UNSUSPENDED',
        entity: 'User',
        entityId: target.id,
        createdAt: new Date('2026-08-18T11:00:00.000Z'),
      });
      await seedAudit({
        userId: actor.id,
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: otherTarget.id,
        createdAt: new Date('2026-08-18T12:00:00.000Z'),
      });

      const result = await service.list({
        actorId: actor.id,
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: target.id,
        from: '2026-08-18T00:00:00.000Z',
        to: '2026-08-18T23:59:59.999Z',
      });

      expect(result.total).toBe(1);
      expect(result.items[0]!.entityId).toBe(target.id);
    });

    it('returns an empty result for a non-matching filter', async () => {
      const actor = await createUser();
      await seedAudit({ userId: actor.id, action: 'USER_SUSPENDED', entity: 'User' });

      const result = await service.list({ action: 'NOT_A_REAL_ACTION' });

      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('handles a missing actor without error and preserves the raw userId', async () => {
      const ghostId = uniqueUuid();
      await seedAudit({
        userId: ghostId,
        action: 'ROLE_ASSIGNED',
        entity: 'UserRole',
        after: { role: 'ADMIN' },
      });

      const result = await service.list({ actorId: ghostId });

      expect(result.total).toBe(1);
      expect(result.items[0]!.userId).toBe(ghostId);
      expect(result.items[0]!.actor).toBeNull();
    });

    it('resolves a soft-deleted actor normally', async () => {
      const actor = await createUser();
      const target = await createUser();
      await seedAudit({
        userId: actor.id,
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: target.id,
      });
      await prisma.user.update({
        where: { id: actor.id },
        data: { deletedAt: new Date() },
      });

      const result = await service.list({ actorId: actor.id });

      expect(result.total).toBe(1);
      expect(result.items[0]!.actor).toEqual({
        id: actor.id,
        mobile: actor.mobile,
        firstName: actor.firstName,
        lastName: actor.lastName,
      });
    });

    it('passes before/after payloads through exactly and preserves nulls', async () => {
      const actor = await createUser();
      await seedAudit({
        userId: actor.id,
        action: 'PARTNER_TIER_CHANGED',
        entity: 'Partner',
        before: { tierId: null },
        after: { tierId: 'tier-1' },
      });
      await seedAudit({
        userId: actor.id,
        action: 'SESSION_CREATED',
        entity: 'UserSession',
      });

      const result = await service.list({ actorId: actor.id, action: 'PARTNER_TIER_CHANGED' });
      expect(result.items[0]!.before).toEqual({ tierId: null });
      expect(result.items[0]!.after).toEqual({ tierId: 'tier-1' });

      const sessions = await service.list({ actorId: actor.id, action: 'SESSION_CREATED' });
      expect(sessions.items[0]!.before).toBeNull();
      expect(sessions.items[0]!.after).toBeNull();
    });

    it('never leaks secrets in the serialized response', async () => {
      const actor = await createUser();
      await service.log({
        userId: actor.id,
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: actor.id,
        before: { status: 'ACTIVE' },
        after: { status: 'SUSPENDED', reason: 'تخلف' },
        ipAddress: '1.2.3.4',
      });

      const result = await service.list({ actorId: actor.id, action: 'USER_SUSPENDED' });
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('tokenHash');
      expect(serialized).not.toContain('sessionId');
      expect(serialized).not.toContain('storageKey');
      expect(serialized).not.toContain('otp');
    });

    it('returns a deterministic total and item set for repeated identical queries', async () => {
      const actor = await createUser();
      await seedAudit({ userId: actor.id, action: 'SESSION_CREATED', entity: 'UserSession' });
      await seedAudit({ userId: actor.id, action: 'SESSION_REVOKED', entity: 'UserSession' });

      const first = await service.list({ actorId: actor.id, page: 1, limit: 1 });
      const second = await service.list({ actorId: actor.id, page: 1, limit: 1 });
      const all = await service.list({ actorId: actor.id, limit: 100 });

      expect(first.total).toBe(2);
      expect(second.total).toBe(2);
      expect(all.total).toBe(2);
      expect(all.items).toHaveLength(2);
      expect(first.items[0]!.id).toBe(second.items[0]!.id);
    });
  });
});