import { PrismaService } from '../src/common/database/prisma.service';

jest.setTimeout(30_000);

/**
 * Task 05.1 migration invariants. The global test harness resolves a
 * `*_test` database and applies committed migrations before this suite runs.
 */
describe('Merchandising schema foundation integration', () => {
  let prisma: PrismaService;
  const campaignNames: string[] = [];
  const publicationVersions: number[] = [];
  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.homepageDraft.deleteMany({ where: { id: 'homepage' } });
    if (campaignNames.length > 0) {
      await prisma.merchCampaign.deleteMany({
        where: { internalName: { in: campaignNames } },
      });
    }
    if (publicationVersions.length > 0) {
      await prisma.homepagePublication.deleteMany({
        where: { version: { in: publicationVersions } },
      });
    }
    await prisma.$disconnect();
  });

  it('enforces the one-row homepage draft singleton and revision check', async () => {
    await prisma.homepageDraft.deleteMany({ where: { id: 'homepage' } });
    await prisma.homepageDraft.create({
      data: { id: 'homepage', revision: 0, sections: [] },
    });
    await expect(
      prisma.homepageDraft.create({
        data: { id: 'another-draft', revision: 0, sections: [] },
      }),
    ).rejects.toBeDefined();
    await prisma.homepageDraft.deleteMany({ where: { id: 'homepage' } });
  });

  it('enforces campaign CTA target and schedule-window invariants', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    campaignNames.push(`cta-${suffix}`, `window-${suffix}`);

    await expect(
      prisma.merchCampaign.create({
        data: {
          internalName: `cta-${suffix}`,
          type: 'EDITORIAL',
          titleFa: 'cta-check',
          ctaKind: 'PRODUCT',
        },
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.merchCampaign.create({
        data: {
          internalName: `window-${suffix}`,
          type: 'EDITORIAL',
          titleFa: 'window-check',
          startsAt: new Date('2026-11-11T00:00:00.000Z'),
          endsAt: new Date('2026-11-10T00:00:00.000Z'),
        },
      }),
    ).rejects.toBeDefined();
  });

  it('enforces the single live homepage publication and status metadata', async () => {
    const versionBase = Math.floor(Date.now() / 1000);
    const versions = [versionBase, versionBase + 1, versionBase + 2, versionBase + 3];
    publicationVersions.push(...versions);

    await expect(
      prisma.homepagePublication.create({
        data: {
          version: versions[0]!,
          status: 'PUBLISHED',
          sections: [],
          sourceDraftRevision: 0,
        },
      }),
    ).rejects.toBeDefined();

    await prisma.homepagePublication.create({
      data: {
        version: versions[1]!,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        sections: [],
        sourceDraftRevision: 0,
      },
    });

    await expect(
      prisma.homepagePublication.create({
        data: {
          version: versions[2]!,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          sections: [],
          sourceDraftRevision: 0,
        },
      }),
    ).rejects.toBeDefined();

    await prisma.homepagePublication.create({
      data: {
        version: versions[3]!,
        status: 'SCHEDULED',
        publishAt: new Date(Date.now() + 60_000),
        sections: [],
        sourceDraftRevision: 0,
      },
    });
  });
});
