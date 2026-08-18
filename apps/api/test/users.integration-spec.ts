import { NotFoundException } from '@nestjs/common';
import { PartnerApprovalStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { AppRole } from '../src/modules/auth/enums/app-role.enum';
import { UsersService } from '../src/modules/users/users.service';

jest.setTimeout(30_000);

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 90 + 10)}`;
}

describe('Admin user read database integration (SS-061)', () => {
  let prisma: PrismaService;
  let service: UsersService;

  const createdMobiles: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    for (const role of Object.values(AppRole)) {
      await prisma.role.upsert({
        where: { name: role },
        update: {},
        create: { name: role },
      });
    }

    service = new UsersService(prisma);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { mobile: { in: createdMobiles } } });
    await prisma.$disconnect();
  });

  async function createUser(options: {
    mobile: string;
    firstName: string;
    lastName: string;
    status?: UserStatus;
    roles?: AppRole[];
    partner?: { businessName: string; approvalStatus: PartnerApprovalStatus };
  }) {
    const mobile = options.mobile;
    createdMobiles.push(mobile);
    const user = await prisma.user.create({
      data: {
        mobile,
        status: options.status ?? UserStatus.ACTIVE,
        profile: {
          create: {
            firstName: options.firstName,
            lastName: options.lastName,
            ...(options.partner
              ? {
                  partner: {
                    create: {
                      businessName: options.partner.businessName,
                      approvalStatus: options.partner.approvalStatus,
                    },
                  },
                }
              : {}),
          },
        },
      },
      include: { profile: true },
    });

    for (const role of options.roles ?? []) {
      const roleRow = await prisma.role.findUniqueOrThrow({ where: { name: role } });
      await prisma.userRole.create({
        data: { userId: user.id, roleId: roleRow.id, assignedBy: user.id },
      });
    }

    return user;
  }

  describe('list', () => {
    it('searches by mobile with a partial, case-insensitive match', async () => {
      const token = String(Date.now()).slice(-8);
      const firstMobile = `+9891${token}1`;
      const secondMobile = `+9891${token}2`;
      await createUser({
        mobile: firstMobile,
        firstName: 'علی',
        lastName: 'احمدی',
      });
      await createUser({
        mobile: secondMobile,
        firstName: 'زهرا',
        lastName: 'رضایی',
      });

      const result = await service.list({ search: token });

      expect(result.total).toBe(2);
      const mobiles = result.items.map((item) => item.mobile).sort();
      expect(mobiles).toEqual([firstMobile, secondMobile].sort());
    });

    it('searches by first name', async () => {
      await createUser({
        mobile: uniqueMobile(),
        firstName: 'محمد',
        lastName: 'کریمی',
      });

      const result = await service.list({ search: 'محمد' });

      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.items.some((item) => item.profile?.firstName === 'محمد')).toBe(
        true,
      );
    });

    it('searches by last name case-insensitively', async () => {
      const mobile = uniqueMobile();
      await createUser({
        mobile,
        firstName: 'مریم',
        lastName: 'Mohammadi',
      });

      const result = await service.list({ search: 'mohammadi' });

      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.items.some((item) => item.mobile === mobile)).toBe(true);
    });

    it('treats underscore and percent in the search term literally', async () => {
      const literalMobile = uniqueMobile();
      const wildcardMobile = uniqueMobile();
      await createUser({
        mobile: literalMobile,
        firstName: 'سارا',
        lastName: 'میر_احمدی',
      });
      await createUser({
        mobile: wildcardMobile,
        firstName: 'سارا',
        lastName: 'میرXاحمدی',
      });

      const result = await service.list({ search: 'میر_احمدی' });

      expect(result.total).toBe(1);
      expect(result.items[0]!.mobile).toBe(literalMobile);
    });

    it('filters by status', async () => {
      await createUser({
        mobile: uniqueMobile(),
        firstName: 'حسین',
        lastName: 'نوری',
        status: UserStatus.SUSPENDED,
      });

      const result = await service.list({ status: UserStatus.SUSPENDED });

      expect(result.total).toBeGreaterThanOrEqual(1);
      for (const item of result.items) {
        expect(item.status).toBe(UserStatus.SUSPENDED);
      }
    });

    it('filters by role through the real Role/UserRole join', async () => {
      await createUser({
        mobile: uniqueMobile(),
        firstName: 'نگار',
        lastName: 'جعفری',
        roles: [AppRole.OPERATOR],
      });

      const result = await service.list({ role: AppRole.OPERATOR });

      expect(result.total).toBeGreaterThanOrEqual(1);
      for (const item of result.items) {
        expect(item.roles).toContain(AppRole.OPERATOR);
      }
    });

    it('combines search, status and role filters', async () => {
      const mobile = uniqueMobile();
      await createUser({
        mobile,
        firstName: 'فرهاد',
        lastName: 'موسوی',
        status: UserStatus.ACTIVE,
        roles: [AppRole.PARTNER],
      });

      const result = await service.list({
        search: 'فرهاد',
        status: UserStatus.ACTIVE,
        role: AppRole.PARTNER,
      });

      expect(result.total).toBe(1);
      expect(result.items[0]!.mobile).toBe(mobile);
    });

    it('paginates with deterministic ordering', async () => {
      const first = await createUser({
        mobile: uniqueMobile(),
        firstName: 'بهرام',
        lastName: 'صادقی',
      });
      await prisma.user.update({
        where: { id: first.id },
        data: { createdAt: new Date(Date.now() + 60_000) },
      });
      const second = await createUser({
        mobile: uniqueMobile(),
        firstName: 'شیما',
        lastName: 'قاسمی',
      });
      await prisma.user.update({
        where: { id: second.id },
        data: { createdAt: new Date(Date.now() + 120_000) },
      });

      const pageOne = await service.list({ page: 1, limit: 1 });
      const pageTwo = await service.list({ page: 2, limit: 1 });

      expect(pageOne.items).toHaveLength(1);
      expect(pageTwo.items).toHaveLength(1);
      expect(pageOne.items[0]!.id).toBe(second.id);
      expect(pageTwo.items[0]!.id).toBe(first.id);
    });

    it('excludes soft-deleted users', async () => {
      const mobile = uniqueMobile();
      const user = await createUser({
        mobile,
        firstName: 'یاسمن',
        lastName: 'کاظمی',
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });

      const result = await service.list({ search: 'یاسمن' });

      expect(result.total).toBe(0);
    });

    it('returns a partner summary on list items when present', async () => {
      await createUser({
        mobile: uniqueMobile(),
        firstName: 'پویا',
        lastName: 'رحیمی',
        roles: [AppRole.PARTNER],
        partner: {
          businessName: 'اکسیر الکترونیک',
          approvalStatus: PartnerApprovalStatus.APPROVED,
        },
      });

      const result = await service.list({ search: 'پویا' });

      expect(result.total).toBe(1);
      expect(result.items[0]!.partner).toMatchObject({
        businessName: 'اکسیر الکترونیک',
        approvalStatus: PartnerApprovalStatus.APPROVED,
      });
    });

    it('never returns sensitive fields', async () => {
      await createUser({
        mobile: uniqueMobile(),
        firstName: 'لیلا',
        lastName: 'حیدری',
      });

      const result = await service.list({ search: 'لیلا' });
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('sessionId');
    });
  });

  describe('getDetail', () => {
    it('returns the full detail with profile, roles and partner', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'امیر',
        lastName: 'عباسی',
        roles: [AppRole.CUSTOMER, AppRole.PARTNER],
        partner: {
          businessName: 'صنایع پارس',
          approvalStatus: PartnerApprovalStatus.PENDING,
        },
      });

      const result = await service.getDetail(user.id);

      expect(result).toMatchObject({
        id: user.id,
        mobile: user.mobile,
        status: UserStatus.ACTIVE,
        profile: { firstName: 'امیر', lastName: 'عباسی' },
        roles: [
          { name: AppRole.CUSTOMER, assignedAt: expect.any(String) },
          { name: AppRole.PARTNER, assignedAt: expect.any(String) },
        ],
        partner: {
          businessName: 'صنایع پارس',
          approvalStatus: PartnerApprovalStatus.PENDING,
        },
        lastLoginAt: null,
      });
      expect(result.createdAt).toEqual(expect.any(String));
      expect(result.updatedAt).toEqual(expect.any(String));
      expect(JSON.stringify(result)).not.toContain('passwordHash');
      expect(JSON.stringify(result)).not.toContain('refreshToken');
    });

    it('returns a null profile and partner for a profile-less user', async () => {
      const mobile = uniqueMobile();
      createdMobiles.push(mobile);
      const user = await prisma.user.create({
        data: { mobile, status: UserStatus.ACTIVE },
      });

      const result = await service.getDetail(user.id);

      expect(result.profile).toBeNull();
      expect(result.partner).toBeNull();
    });

    it('throws 404 for a missing user', async () => {
      await expect(
        service.getDetail('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 404 for a soft-deleted user', async () => {
      const mobile = uniqueMobile();
      const user = await createUser({
        mobile,
        firstName: 'سارا',
        lastName: 'محمدی',
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });

      await expect(service.getDetail(user.id)).rejects.toThrow(NotFoundException);
    });
  });
});