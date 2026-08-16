import { ConflictException } from '@nestjs/common';
import {
  PartnerApprovalStatus,
  PartnerDocumentType,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { AppRole } from '../src/modules/auth/enums/app-role.enum';
import { RolesService } from '../src/modules/auth/roles/roles.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { AdminPartnersService } from '../src/modules/partners/admin-partners.service';

jest.setTimeout(30_000);

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 90 + 10)}`;
}

describe('Admin partner review database integration (SS-040)', () => {
  let prisma: PrismaService;
  let service: AdminPartnersService;
  let partnerRoleId: string;
  let tierId: string;

  const createdMobiles: string[] = [];
  const createdPartnerIds: string[] = [];

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
    partnerRoleId = (
      await prisma.role.findUniqueOrThrow({ where: { name: AppRole.PARTNER } })
    ).id;

    const tier = await prisma.partnerTier.create({
      data: { name: 'Tier INT', discountPercent: 5, minOrderQuantity: 1 },
    });
    tierId = tier.id;

    const auditService = new AuditService(prisma);
    const rolesService = new RolesService(prisma);
    service = new AdminPartnersService(prisma, auditService, rolesService);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: createdPartnerIds } },
    });
    await prisma.user.deleteMany({ where: { mobile: { in: createdMobiles } } });
    await prisma.partnerTier.deleteMany({ where: { id: tierId } });
    await prisma.$disconnect();
  });

  async function createPendingPartner() {
    const mobile = uniqueMobile();
    createdMobiles.push(mobile);
    const user = await prisma.user.create({
      data: {
        mobile,
        status: UserStatus.ACTIVE,
        profile: { create: { firstName: 'علی', lastName: 'احمدی' } },
      },
      include: { profile: true },
    });

    const partner = await prisma.partner.create({
      data: {
        profileId: user.profile!.id,
        businessName: 'اکسیر الکترونیک',
        businessLicenseNo: 'LIC-INT',
        nationalId: '1122334455',
        address: 'تهران',
        city: 'تهران',
        province: 'تهران',
        approvalStatus: PartnerApprovalStatus.PENDING,
        submittedAt: new Date(),
        createdBy: user.id,
      },
    });
    createdPartnerIds.push(partner.id);

    await prisma.businessDocument.create({
      data: {
        partnerId: partner.id,
        type: PartnerDocumentType.BUSINESS_LICENSE,
        originalName: 'license.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        storageKey: `partners/${partner.id}/license.pdf`,
      },
    });

    return { user, partner };
  }

  it('commits approval, role activation and audit together', async () => {
    const { user, partner } = await createPendingPartner();

    const result = await service.approve(
      partner.id,
      { tierId, reviewNotes: 'اسناد کامل است' },
      'reviewer-1',
      '1.2.3.4',
    );

    expect(result.approvalStatus).toBe(PartnerApprovalStatus.APPROVED);
    expect(result.tier?.id).toBe(tierId);

    const stored = await prisma.partner.findUnique({ where: { id: partner.id } });
    expect(stored?.approvalStatus).toBe(PartnerApprovalStatus.APPROVED);
    expect(stored?.tierId).toBe(tierId);
    expect(stored?.approvedAt).not.toBeNull();

    const userRole = await prisma.userRole.findUnique({
      where: {
        userId_roleId: { userId: user.id, roleId: partnerRoleId },
      },
    });
    expect(userRole).toBeDefined();
    expect(userRole!.assignedBy).toBe('reviewer-1');

    const audits = await prisma.auditLog.findMany({
      where: { entityId: partner.id, action: 'PARTNER_APPROVED' },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.userId).toBe('reviewer-1');
    const serialized = JSON.stringify(audits[0]);
    expect(serialized).not.toContain('nationalId');
    expect(serialized).not.toContain('businessLicenseNo');
  });

  it('rolls back the approval when the role activation fails', async () => {
    const { user, partner } = await createPendingPartner();

    const realTransaction = prisma.$transaction.bind(prisma);
    const failingPrisma = new Proxy(prisma, {
      get(target, prop) {
        if (prop === '$transaction') {
          return async (
            operation: unknown,
            options?: unknown,
          ): Promise<unknown> => {
            if (typeof operation === 'function') {
              return realTransaction(
                (tx: unknown) => {
                  const proxiedTx = new Proxy(tx as object, {
                    get(txTarget, txProp) {
                      if (txProp === 'userRole') {
                        return new Proxy(
                          (txTarget as Record<string, unknown>).userRole as object,
                          {
                            get(roleTarget, roleProp) {
                              if (roleProp === 'upsert') {
                                return async () => {
                                  throw new Error('forced role upsert failure');
                                };
                              }
                              return Reflect.get(roleTarget, roleProp, roleTarget);
                            },
                          },
                        );
                      }
                      return Reflect.get(txTarget, txProp, txTarget);
                    },
                  });
                  return (operation as (client: unknown) => Promise<unknown>)(
                    proxiedTx,
                  );
                },
                options as never,
              );
            }
            return realTransaction(operation as never, options as never);
          };
        }
        return Reflect.get(target, prop, target);
      },
    });

    const failingService = new AdminPartnersService(
      failingPrisma as unknown as PrismaService,
      new AuditService(prisma),
      new RolesService(prisma),
    );

    await expect(
      failingService.approve(
        partner.id,
        { tierId },
        'reviewer-1',
        '1.2.3.4',
      ),
    ).rejects.toThrow('forced role upsert failure');

    const stored = await prisma.partner.findUnique({ where: { id: partner.id } });
    expect(stored?.approvalStatus).toBe(PartnerApprovalStatus.PENDING);
    expect(stored?.approvedAt).toBeNull();
    expect(stored?.tierId).toBeNull();

    const userRole = await prisma.userRole.findUnique({
      where: {
        userId_roleId: { userId: user.id, roleId: partnerRoleId },
      },
    });
    expect(userRole).toBeNull();

    const audits = await prisma.auditLog.findMany({
      where: { entityId: partner.id, action: 'PARTNER_APPROVED' },
    });
    expect(audits).toHaveLength(0);
  });

  it('allows exactly one of two concurrent approvals', async () => {
    const { user, partner } = await createPendingPartner();

    const results = await Promise.allSettled([
      service.approve(partner.id, { tierId }, 'reviewer-1'),
      service.approve(partner.id, { tierId }, 'reviewer-2'),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );

    const userRoles = await prisma.userRole.findMany({
      where: { userId: user.id, roleId: partnerRoleId },
    });
    expect(userRoles).toHaveLength(1);

    const audits = await prisma.auditLog.findMany({
      where: { entityId: partner.id, action: 'PARTNER_APPROVED' },
    });
    expect(audits).toHaveLength(1);
  });

  it('rejects an already approved partner with 409', async () => {
    const { user, partner } = await createPendingPartner();

    await service.approve(partner.id, { tierId }, 'reviewer-1');

    await expect(
      service.approve(partner.id, { tierId }, 'reviewer-2'),
    ).rejects.toThrow(ConflictException);

    const userRoles = await prisma.userRole.findMany({
      where: { userId: user.id, roleId: partnerRoleId },
    });
    expect(userRoles).toHaveLength(1);
  });

  it('prevents a tier change for a non-APPROVED partner', async () => {
    const { partner } = await createPendingPartner();

    await expect(
      service.changeTier(partner.id, { tierId }, 'reviewer-1'),
    ).rejects.toThrow(ConflictException);
  });
});
