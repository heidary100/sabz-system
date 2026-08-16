import { Prisma, PrismaClient, PartnerApprovalStatus, PartnerDocumentType, UserStatus } from '@prisma/client';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 90 + 10)}`;
}

describe('Partner application database integration (SS-039)', () => {
  let prisma: PrismaClient;
  const createdMobiles: string[] = [];

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { mobile: { in: createdMobiles } } });
    await prisma.$disconnect();
  });

  async function createUserWithProfile(mobile: string) {
    createdMobiles.push(mobile);
    return prisma.user.create({
      data: {
        mobile,
        status: UserStatus.ACTIVE,
        profile: {
          create: { firstName: 'علی', lastName: 'احمدی' },
        },
      },
      include: { profile: true },
    });
  }

  it('enforces one Partner per UserProfile with a unique constraint', async () => {
    const user = await createUserWithProfile(uniqueMobile());
    const profileId = user.profile!.id;

    await prisma.partner.create({
      data: { profileId, businessName: 'اکسیر' },
    });

    await expect(
      prisma.partner.create({
        data: { profileId, businessName: 'اکسیر دوم' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('defaults the partner approval status to DRAFT', async () => {
    const user = await createUserWithProfile(uniqueMobile());

    const partner = await prisma.partner.create({
      data: { profileId: user.profile!.id, businessName: 'اکسیر' },
    });

    expect(partner.approvalStatus).toBe(PartnerApprovalStatus.DRAFT);
    expect(partner.submittedAt).toBeNull();
  });

  it('persists document metadata with a unique storage key', async () => {
    const user = await createUserWithProfile(uniqueMobile());
    const partner = await prisma.partner.create({
      data: { profileId: user.profile!.id, businessName: 'اکسیر' },
    });

    const storageKey = `partners/${partner.id}/doc-1.pdf`;
    const document = await prisma.businessDocument.create({
      data: {
        partnerId: partner.id,
        type: PartnerDocumentType.BUSINESS_LICENSE,
        originalName: 'license.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        storageKey,
      },
    });

    const found = await prisma.businessDocument.findUnique({
      where: { id: document.id },
    });
    expect(found?.type).toBe(PartnerDocumentType.BUSINESS_LICENSE);
    expect(found?.storageKey).toBe(storageKey);

    await expect(
      prisma.businessDocument.create({
        data: {
          partnerId: partner.id,
          type: PartnerDocumentType.SUPPORTING,
          originalName: 'dup.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          storageKey,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('cascades Partner deletion to its documents', async () => {
    const user = await createUserWithProfile(uniqueMobile());
    const partner = await prisma.partner.create({
      data: { profileId: user.profile!.id, businessName: 'اکسیر' },
    });

    await prisma.businessDocument.create({
      data: {
        partnerId: partner.id,
        type: PartnerDocumentType.SUPPORTING,
        originalName: 'support.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        storageKey: `partners/${partner.id}/doc-cascade.pdf`,
      },
    });

    await prisma.partner.delete({ where: { id: partner.id } });

    const count = await prisma.businessDocument.count({
      where: { partnerId: partner.id },
    });
    expect(count).toBe(0);
  });

  it('supports the full lifecycle transition states at the database level', async () => {
    const user = await createUserWithProfile(uniqueMobile());
    const partner = await prisma.partner.create({
      data: { profileId: user.profile!.id, businessName: 'اکسیر' },
    });

    const submittedAt = new Date('2026-08-16T01:00:00.000Z');
    await prisma.partner.update({
      where: { id: partner.id },
      data: {
        approvalStatus: PartnerApprovalStatus.PENDING,
        submittedAt,
      },
    });

    const rejectedAt = new Date('2026-08-16T02:00:00.000Z');
    await prisma.partner.update({
      where: { id: partner.id },
      data: {
        approvalStatus: PartnerApprovalStatus.REJECTED,
        rejectedAt,
        rejectionReason: 'مدارک ناقص',
      },
    });

    const resubmitted = await prisma.partner.update({
      where: { id: partner.id },
      data: {
        approvalStatus: PartnerApprovalStatus.PENDING,
        submittedAt: new Date('2026-08-16T03:00:00.000Z'),
        rejectedAt: null,
        rejectionReason: null,
      },
    });

    expect(resubmitted.approvalStatus).toBe(PartnerApprovalStatus.PENDING);
    expect(resubmitted.rejectedAt).toBeNull();
    expect(resubmitted.rejectionReason).toBeNull();
    expect(resubmitted.submittedAt).not.toBeNull();
  });

  it('excludes soft-deleted documents from active queries', async () => {
    const user = await createUserWithProfile(uniqueMobile());
    const partner = await prisma.partner.create({
      data: { profileId: user.profile!.id, businessName: 'اکسیر' },
    });

    await prisma.businessDocument.create({
      data: {
        partnerId: partner.id,
        type: PartnerDocumentType.TAX_REGISTRATION,
        originalName: 'tax.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 20,
        storageKey: `partners/${partner.id}/doc-soft.pdf`,
        deletedAt: new Date(),
      },
    });

    const active = await prisma.businessDocument.findMany({
      where: { partnerId: partner.id, deletedAt: null },
    });
    expect(active).toHaveLength(0);

    const all = await prisma.businessDocument.findMany({
      where: { partnerId: partner.id },
    });
    expect(all).toHaveLength(1);
  });

  it('uses the Prisma enum values for document types', async () => {
    const values = Object.values(PartnerDocumentType);
    expect(values).toEqual([
      'BUSINESS_LICENSE',
      'NATIONAL_ID',
      'TAX_REGISTRATION',
      'SUPPORTING',
    ]);
  });

  it('enforces a database-level unique violation error type for Prisma', async () => {
    const user = await createUserWithProfile(uniqueMobile());
    const profileId = user.profile!.id;

    await prisma.partner.create({
      data: { profileId, businessName: 'اکسیر' },
    });

    const error = await prisma.partner
      .create({ data: { profileId, businessName: 'دوم' } })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
  });
});
