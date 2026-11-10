import { Prisma } from '@prisma/client';
import type {
  HomepageDraftSection,
  HomepageSnapshot,
  MerchCampaignSnapshot,
} from '@sabz/types';
import { HomepageSourceService } from './homepage-source.service';

const CAMPAIGN_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const MEDIA_ID = '7d444840-9dc0-11d1-b245-5ffdce74fad2';

interface CampaignRow {
  id: string;
  isEnabled: boolean;
  archivedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

interface MediaRow {
  id: string;
  deletedAt: Date | null;
}

function media(
  mediaId = MEDIA_ID,
  slot: 'HERO_DESKTOP' | 'BANNER' = 'HERO_DESKTOP',
): MerchCampaignSnapshot['media'][number] {
  return {
    mediaId,
    slot,
    altFa: null,
    focalX: 50,
    focalY: 50,
    sortOrder: 0,
  };
}

function snapshot(
  campaign: Partial<MerchCampaignSnapshot> = {},
  mediaItems: MerchCampaignSnapshot['media'] = [media()],
): HomepageSnapshot {
  return {
    schemaVersion: 1,
    sections: [
      {
        key: 'hero',
        type: 'HERO_CAROUSEL',
        order: 0,
        isVisible: true,
        settings: {
          campaigns: [
            {
              sourceCampaignId: CAMPAIGN_ID,
              type: 'SEASONAL',
              titleFa: 'Campaign',
              eyebrowFa: null,
              subtitleFa: null,
              descriptionFa: null,
              ctaLabelFa: null,
              cta: { kind: 'NONE' },
              productIds: [],
              categoryIds: [],
              brandIds: [],
              media: mediaItems,
              startsAt: null,
              endsAt: null,
              ...campaign,
            },
          ],
        },
      },
    ],
  };
}

function client(
  args: {
    campaign?: Partial<CampaignRow>;
    media?: MediaRow[];
  } = {},
): Prisma.TransactionClient {
  const campaign = {
    id: CAMPAIGN_ID,
    type: 'SEASONAL',
    titleFa: 'Campaign',
    eyebrowFa: null,
    subtitleFa: null,
    descriptionFa: null,
    ctaLabelFa: null,
    ctaKind: 'NONE',
    ctaProductId: null,
    ctaCategoryId: null,
    ctaBrandId: null,
    isEnabled: true,
    archivedAt: null,
    startsAt: new Date(Date.now() - 3_600_000),
    endsAt: new Date(Date.now() + 3_600_000),
    products: [],
    categories: [],
    brands: [],
    media: [
      {
        mediaId: MEDIA_ID,
        slot: 'HERO_DESKTOP',
        altFa: null,
        focalX: 50,
        focalY: 50,
        sortOrder: 0,
        media: { id: MEDIA_ID, deletedAt: null },
      },
    ],
    ...args.campaign,
  } as CampaignRow;
  return {
    merchCampaign: {
      findMany: jest.fn().mockResolvedValue([campaign]),
    },
    product: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    brand: { findMany: jest.fn().mockResolvedValue([]) },
    merchMedia: {
      findMany: jest.fn().mockResolvedValue(args.media ?? [{ id: MEDIA_ID, deletedAt: null }]),
    },
    blogPost: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as Prisma.TransactionClient;
}

function codes(result: { errors: Array<{ code: string }> }): string[] {
  return result.errors.map((error) => error.code);
}

describe('HomepageSourceService snapshot lifecycle eligibility', () => {
  const service = new HomepageSourceService();

  it('accepts an enabled, active campaign with valid hero media', async () => {
    const result = await service.validateSnapshot(client(), snapshot());
    expect(result.errors).toEqual([]);
  });

  it('allows a future-start draft with a warning but rejects it for current publication', async () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const future = {
      startsAt: new Date(now.getTime() + 3_600_000),
      endsAt: new Date(now.getTime() + 7_200_000),
    };
    const sections: HomepageDraftSection[] = [
      {
        key: 'hero',
        type: 'HERO_CAROUSEL',
        order: 0,
        isVisible: true,
        settings: { campaignIds: [CAMPAIGN_ID] },
      },
    ];

    const draft = await service.validateDraft(client({ campaign: future }), sections, {
      now,
    });
    expect(codes(draft)).not.toContain('CAMPAIGN_NOT_STARTED');
    expect(draft.warnings.map((warning) => warning.code)).toContain(
      'CAMPAIGN_NOT_STARTED',
    );

    const scheduled = await service.buildSnapshot(
      client({ campaign: future }),
      sections,
      { now, windowPolicy: 'allow-future-start' },
    );
    expect(scheduled.snapshot).not.toBeNull();

    const immediate = await service.buildSnapshot(
      client({ campaign: future }),
      sections,
      { now, windowPolicy: 'require-active-window' },
    );
    expect(immediate.snapshot).toBeNull();
    expect(codes(immediate)).toContain('CAMPAIGN_NOT_STARTED');
  });

  it.each([
    ['disabled', { isEnabled: false }, 'CAMPAIGN_DISABLED'],
    [
      'archived',
      { archivedAt: new Date('2026-05-31T23:00:00.000Z') },
      'CAMPAIGN_ARCHIVED',
    ],
    [
      'expired',
      {
        startsAt: new Date('2026-05-31T22:00:00.000Z'),
        endsAt: new Date('2026-05-31T23:00:00.000Z'),
      },
      'CAMPAIGN_EXPIRED',
    ],
  ])(
    'rejects a %s campaign for immediate publication',
    async (_label, campaign, code) => {
      const now = new Date('2026-06-01T00:00:00.000Z');
      const sections: HomepageDraftSection[] = [
        {
          key: 'hero',
          type: 'HERO_CAROUSEL',
          order: 0,
          isVisible: true,
          settings: { campaignIds: [CAMPAIGN_ID] },
        },
      ];
      const result = await service.buildSnapshot(
        client({ campaign }),
        sections,
        { now, windowPolicy: 'require-active-window' },
      );
      expect(result.snapshot).toBeNull();
      expect(codes(result)).toContain(code);
    },
  );

  it('rejects disabled, archived, not-yet-started, and expired campaigns', async () => {
    const now = Date.now();
    const cases: Array<[Partial<CampaignRow>, string]> = [
      [{ isEnabled: false }, 'CAMPAIGN_DISABLED'],
      [{ archivedAt: new Date(now - 60_000) }, 'CAMPAIGN_ARCHIVED'],
      [
        {
          startsAt: new Date(now + 3_600_000),
          endsAt: new Date(now + 7_200_000),
        },
        'CAMPAIGN_NOT_STARTED',
      ],
      [
        {
          startsAt: new Date(now - 7_200_000),
          endsAt: new Date(now - 3_600_000),
        },
        'CAMPAIGN_EXPIRED',
      ],
    ];

    for (const [campaign, code] of cases) {
      const result = await service.validateSnapshot(client({ campaign }), snapshot());
      expect(codes(result)).toContain(code);
    }
  });

  it('rejects missing and deleted required media', async () => {
    const missing = await service.validateSnapshot(client({ media: [] }), snapshot());
    expect(codes(missing)).toContain('MISSING_MEDIA');

    const deleted = await service.validateSnapshot(
      client({ media: [{ id: MEDIA_ID, deletedAt: new Date() }] }),
      snapshot(),
    );
    expect(codes(deleted)).toContain('MEDIA_INELIGIBLE');
  });

  it('requires a desktop hero slot', async () => {
    const result = await service.validateSnapshot(
      client(),
      snapshot({}, [media(MEDIA_ID, 'BANNER')]),
    );
    expect(codes(result)).toContain('HERO_DESKTOP_MEDIA_REQUIRED');
  });
});
