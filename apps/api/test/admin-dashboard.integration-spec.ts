import { PartnerApprovalStatus, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';

jest.setTimeout(30_000);

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

/**
 * The dashboard aggregates the whole database, and Jest runs spec files in
 * parallel workers against the same Postgres. Global count equality can never
 * be asserted deterministically against a shared, continuously-mutating
 * database, so count assertions use guaranteed lower bounds from this file's
 * own seeds (our rows are only removed by this file's cleanup) plus the
 * documented self-consistency invariant. Recent-list assertions use explicit
 * far-future timestamps so seeded rows rank above any concurrently created
 * rows, which makes ordering, bounds, nulls-last and soft-delete exclusion
 * deterministic.
 */
describe('Admin dashboard API database integration (SS-065)', () => {
  let prisma: PrismaService;
  let service: DashboardService;

  const createdMobiles: string[] = [];
  const createdUserIds: string[] = [];
  const createdPartnerIds: string[] = [];
  const createdAuditIds: string[] = [];
  const roleIds: Record<string, string> = {};

  /**
   * Seeds a role idempotently and race-safely; see the e2e specs for the
   * rationale (parallel workers + non-atomic Prisma upsert).
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
    prisma = new PrismaService();
    await prisma.$connect();
    service = new DashboardService(prisma);

    for (const role of ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN']) {
      roleIds[role] = await seedRole(role);
    }
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ entityId: { in: createdUserIds } }, { userId: { in: createdUserIds } }],
      },
    });
    await prisma.partner.deleteMany({ where: { id: { in: createdPartnerIds } } });
    await prisma.user.deleteMany({ where: { mobile: { in: createdMobiles } } });
    await prisma.$disconnect();
  });

  async function createUser(
    status: UserStatus,
    roles: string[] = [],
    deleted = false,
  ): Promise<{ id: string; mobile: string }> {
    const mobile = uniqueMobile();
    createdMobiles.push(mobile);
    const user = await prisma.user.create({
      data: {
        mobile,
        status,
        deletedAt: deleted ? new Date() : null,
        profile: { create: { firstName: 'علی', lastName: 'احمدی' } },
      },
    });
    createdUserIds.push(user.id);
    for (const role of roles) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: roleIds[role]!, assignedBy: user.id },
      });
    }
    return { id: user.id, mobile };
  }

  async function createPartner(
    status: PartnerApprovalStatus,
    options: { submittedAt?: Date | null; deleted?: boolean } = {},
  ): Promise<{ id: string }> {
    const mobile = uniqueMobile();
    createdMobiles.push(mobile);
    const user = await prisma.user.create({
      data: {
        mobile,
        status: UserStatus.ACTIVE,
        profile: { create: { firstName: 'فاطمه', lastName: 'کریمی' } },
      },
      include: { profile: true },
    });
    createdUserIds.push(user.id);
    const partner = await prisma.partner.create({
      data: {
        profileId: user.profile!.id,
        businessName: `شرکت ${status} ${mobile.slice(-4)}`,
        approvalStatus: status,
        submittedAt: options.submittedAt === undefined ? new Date() : options.submittedAt,
        deletedAt: options.deleted ? new Date() : null,
      },
    });
    createdPartnerIds.push(partner.id);
    return { id: partner.id };
  }

  async function seedAudit(
    userId: string | null,
    action: string,
    entity: string,
    createdAt?: Date,
  ): Promise<string> {
    const id = await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        createdAt,
        before: Prisma.DbNull,
        after: Prisma.DbNull,
      },
    });
    createdAuditIds.push(id.id);
    return id.id;
  }

  it('counts users and maintains the documented total invariant', async () => {
    const activeMobiles: string[] = [];
    const seeded = await createUser(UserStatus.ACTIVE);
    activeMobiles.push(seeded.mobile);
    const seeded2 = await createUser(UserStatus.ACTIVE);
    activeMobiles.push(seeded2.mobile);
    await createUser(UserStatus.SUSPENDED);
    await createUser(UserStatus.LOCKED);
    await createUser(UserStatus.PENDING_OTP);
    await createUser(UserStatus.ACTIVE, [], true);

    const result = await service.getSummary();

    // Documented invariant: the statuses are mutually exclusive, so total is
    // the sum of the four buckets. Both sides come from the same snapshot, so
    // this holds regardless of concurrent workers.
    expect(result.users.total).toBe(
      result.users.active + result.users.suspended + result.users.locked + result.users.pendingOtp,
    );

    // Our non-deleted seeds are guaranteed to be counted: parallel workers only
    // add rows, and our rows are only removed by this file's own cleanup. The
    // soft-deleted seed never increments a bucket (unit tests pin the
    // `deletedAt: null` filter exactly).
    const ourActive = await prisma.user.count({
      where: { mobile: { in: activeMobiles }, deletedAt: null },
    });
    expect(ourActive).toBe(2);
    expect(result.users.active).toBeGreaterThanOrEqual(ourActive);
  });

  it('counts role assignments among non-deleted users regardless of status', async () => {
    await createUser(UserStatus.ACTIVE, ['CUSTOMER']);
    await createUser(UserStatus.ACTIVE, ['CUSTOMER', 'PARTNER']);
    await createUser(UserStatus.SUSPENDED, ['OPERATOR']);
    await createUser(UserStatus.ACTIVE, ['ADMIN']);
    // A soft-deleted ADMIN-role user must not be counted in the admin bucket.
    await createUser(UserStatus.ACTIVE, ['ADMIN'], true);

    const result = await service.getSummary();

    // Lower bounds from this test's own non-deleted seeds: the service must
    // count every non-deleted user holding each role. Exact bucket equality
    // cannot be asserted here because parallel workers also assign roles.
    expect(result.roles.customer).toBeGreaterThanOrEqual(2);
    expect(result.roles.partner).toBeGreaterThanOrEqual(1);
    expect(result.roles.operator).toBeGreaterThanOrEqual(1);
    expect(result.roles.admin).toBeGreaterThanOrEqual(1);
  });

  it('counts partner lifecycle states and excludes soft-deleted partners', async () => {
    await createPartner(PartnerApprovalStatus.DRAFT, { submittedAt: null });
    await createPartner(PartnerApprovalStatus.PENDING);
    await createPartner(PartnerApprovalStatus.APPROVED);
    await createPartner(PartnerApprovalStatus.REJECTED);
    const deleted = await createPartner(PartnerApprovalStatus.PENDING, {
      submittedAt: new Date(Date.now() + 6_000_000),
      deleted: true,
    });

    const result = await service.getSummary();

    // Lower bounds from this test's own seeds.
    expect(result.partners.draft).toBeGreaterThanOrEqual(1);
    expect(result.partners.pending).toBeGreaterThanOrEqual(1);
    expect(result.partners.approved).toBeGreaterThanOrEqual(1);
    expect(result.partners.rejected).toBeGreaterThanOrEqual(1);

    // Soft-delete exclusion: the deleted partner has the newest submittedAt of
    // all rows, so if the `deletedAt: null` filter were missing it would rank
    // first in recent applications. Its absence is deterministic proof the
    // filter applies.
    const ids = result.recentPartners.map((partner) => partner.id);
    expect(ids).not.toContain(deleted.id);
  });

  it('returns the five most recent partners ordered by submittedAt DESC with nulls last', async () => {
    const base = Date.now() + 1_000_000;
    const draft = await createPartner(PartnerApprovalStatus.DRAFT, {
      submittedAt: null,
    });
    const p1 = await createPartner(PartnerApprovalStatus.PENDING, {
      submittedAt: new Date(base),
    });
    const p2 = await createPartner(PartnerApprovalStatus.APPROVED, {
      submittedAt: new Date(base + 1_000),
    });
    const p3 = await createPartner(PartnerApprovalStatus.REJECTED, {
      submittedAt: new Date(base + 2_000),
    });
    const p4 = await createPartner(PartnerApprovalStatus.PENDING, {
      submittedAt: new Date(base + 3_000),
    });
    const p5 = await createPartner(PartnerApprovalStatus.PENDING, {
      submittedAt: new Date(base + 4_000),
    });
    const p6 = await createPartner(PartnerApprovalStatus.PENDING, {
      submittedAt: new Date(base + 5_000),
    });

    const result = await service.getSummary();

    expect(result.recentPartners).toHaveLength(5);
    const ids = result.recentPartners.map((partner) => partner.id);
    expect(ids).toEqual([p6.id, p5.id, p4.id, p3.id, p2.id]);
    expect(ids).not.toContain(p1.id);
    expect(ids).not.toContain(draft.id);

    const first = result.recentPartners[0]!;
    expect(first.businessName).toContain('PENDING');
    expect(first.submittedAt).toBe(new Date(base + 5_000).toISOString());
    expect(first.createdAt).toEqual(expect.any(String));
    expect(Date.parse(first.createdAt)).not.toBeNaN();
  });

  it('returns the eight most recent audit entries with actors resolved', async () => {
    const actor = await createUser(UserStatus.ACTIVE);
    const base = Date.now() + 3_000_000;
    const auditIds: string[] = [];
    for (let i = 0; i < 9; i += 1) {
      auditIds.push(
        await seedAudit(actor.id, 'USER_SUSPENDED', 'User', new Date(base + i * 1_000)),
      );
    }

    const result = await service.getSummary();

    // The bounded take of 8 is pinned exactly by the unit tests. Here, verify
    // that this test's seeds appear in descending createdAt order without
    // assuming the top 8 rows are exclusively ours (other workers may also
    // insert rows).
    expect(result.recentAudit.length).toBeLessThanOrEqual(8);
    const ours = result.recentAudit.filter((item) => auditIds.includes(item.id));
    expect(ours.length).toBeGreaterThan(0);
    const seedIndexes = ours.map((item) => auditIds.indexOf(item.id));
    expect(seedIndexes).toEqual([...seedIndexes].sort((a, b) => b - a));

    const newest = ours[0]!;
    expect(newest!.actor).toEqual({
      id: actor.id,
      mobile: actor.mobile,
      firstName: 'علی',
      lastName: 'احمدی',
    });
    expect(newest!.entity).toBe('User');
    expect(newest!.entityId).toBeNull();
    expect(newest!.createdAt).toEqual(expect.any(String));
  });

  it('keeps userId and sets actor null for a missing actor', async () => {
    const ghostId = crypto.randomUUID();
    await seedAudit(ghostId, 'ROLE_ASSIGNED', 'UserRole', new Date(Date.now() + 4_000_000));

    const result = await service.getSummary();

    const entry = result.recentAudit.find((item) => item.userId === ghostId);
    expect(entry).toBeDefined();
    expect(entry!.actor).toBeNull();
  });

  it('resolves a soft-deleted actor normally', async () => {
    const actor = await createUser(UserStatus.ACTIVE);
    const auditId = await seedAudit(
      actor.id,
      'USER_SUSPENDED',
      'User',
      new Date(Date.now() + 5_000_000),
    );
    await prisma.user.update({
      where: { id: actor.id },
      data: { deletedAt: new Date() },
    });

    const result = await service.getSummary();

    const entry = result.recentAudit.find((item) => item.id === auditId);
    expect(entry).toBeDefined();
    expect(entry!.actor).toEqual({
      id: actor.id,
      mobile: actor.mobile,
      firstName: 'علی',
      lastName: 'احمدی',
    });
  });

  it('never leaks sensitive data or audit payloads in the summary', async () => {
    const result = await service.getSummary();
    const serialized = JSON.stringify(result);

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
});
