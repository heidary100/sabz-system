import { ConflictException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import * as campaignLifecycle from '../src/modules/merchandising/campaigns/campaign-lifecycle';
import { CampaignService } from '../src/modules/merchandising/campaigns/campaign.service';
import { HOMEPAGE_ACTIVATION_SYSTEM_ACTOR, HomepageActivationService } from '../src/modules/merchandising/homepage/homepage-activation.service';
import { HomepagePublicationService } from '../src/modules/merchandising/homepage/homepage-publication.service';
import { HomepageSourceService } from '../src/modules/merchandising/homepage/homepage-source.service';
import { PublicHomepageCache } from '../src/modules/merchandising/homepage/public-homepage.cache';
import { MerchMediaService } from '../src/modules/merchandising/media/merch-media.service';

jest.setTimeout(120_000);

const BASE = '/api/v1/catalog/homepage';

function token(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('Scheduled homepage publication activation (Task 05.6) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let activation: HomepageActivationService;
  let publications: HomepagePublicationService;
  let mediaService: MerchMediaService;
  let campaignService: CampaignService;
  let sourceService: HomepageSourceService;
  let cache: PublicHomepageCache;

  const publicationIds: string[] = [];
  const mediaIds: string[] = [];
  const campaignIds: string[] = [];
  const originalActivationEnv = process.env.HOMEPAGE_ACTIVATION_ENABLED;

  let currentPublicationId = '';
  let scheduledPublicationId = '';
  let defaultCampaignId = '';
  let oldMediaId = '';
  let newMediaId = '';
  let sharedMediaId = '';
  let deletedMediaId = '';
  let scheduledSnapshot: Record<string, unknown>;
  let oldSnapshot: Record<string, unknown>;
  let newSnapshot: Record<string, unknown>;

  async function nextVersion(): Promise<number> {
    const aggregate = await prisma.homepagePublication.aggregate({
      _max: { version: true },
    });
    return (aggregate._max.version ?? 0) + 1;
  }

  function heroSnapshot(
    title: string,
    media: Array<{ mediaId: string; slot: 'HERO_DESKTOP' | 'BANNER' }>,
    sourceCampaignId: string = defaultCampaignId,
  ): Record<string, unknown> {
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
                sourceCampaignId,
                type: 'SEASONAL',
                titleFa: title,
                eyebrowFa: null,
                subtitleFa: null,
                descriptionFa: null,
                ctaLabelFa: null,
                cta: { kind: 'NONE' },
                productIds: [],
                categoryIds: [],
                brandIds: [],
                media: media.map((item, index) => ({
                  mediaId: item.mediaId,
                  slot: item.slot,
                  altFa: `${title} alt`,
                  focalX: 50,
                  focalY: 50,
                  sortOrder: index,
                })),
                startsAt: null,
                endsAt: null,
              },
            ],
          },
        },
      ],
    };
  }

  async function createPublication(args: {
    version?: number;
    status: 'PUBLISHED' | 'SCHEDULED' | 'SUPERSEDED' | 'CANCELLED';
    snapshot: unknown;
    publishAt?: Date | null;
    schemaVersion?: number;
  }) {
    const row = await prisma.homepagePublication.create({
      data: {
        version: args.version ?? (await nextVersion()),
        status: args.status,
        publishAt:
          args.status === 'SCHEDULED'
            ? args.publishAt ?? new Date(Date.now() - 60_000)
            : args.status === 'PUBLISHED'
              ? null
              : (args.publishAt ?? null),
        publishedAt: args.status === 'PUBLISHED' ? new Date() : null,
        sections: args.snapshot as object,
        schemaVersion: args.schemaVersion ?? 1,
        sourceDraftRevision: 1,
      },
    });
    publicationIds.push(row.id);
    return row;
  }

  async function createMedia(name: string, deleted = false) {
    const row = await prisma.merchMedia.create({
      data: {
        originalName: name,
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        storageKey: token(`activation-media-${name}`),
        publishedAt: null,
        deletedAt: deleted ? new Date() : null,
      },
    });
    mediaIds.push(row.id);
    return row;
  }

  async function currentPublished() {
    return prisma.homepagePublication.findFirstOrThrow({
      where: { status: 'PUBLISHED' },
    });
  }

  beforeAll(async () => {
    process.env.HOMEPAGE_ACTIVATION_ENABLED = 'false';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    activation = app.get(HomepageActivationService);
    publications = app.get(HomepagePublicationService);
    mediaService = app.get(MerchMediaService);
    campaignService = app.get(CampaignService);
    sourceService = app.get(HomepageSourceService);
    cache = app.get(PublicHomepageCache);

    await prisma.homepagePublication.deleteMany({});
    await prisma.homepageDraft.deleteMany({ where: { id: 'homepage' } });

    const defaultCampaign = await prisma.merchCampaign.create({
      data: {
        internalName: token('activation-default'),
        type: 'SEASONAL',
        titleFa: 'Default activation campaign',
      },
    });
    defaultCampaignId = defaultCampaign.id;
    campaignIds.push(defaultCampaign.id);

    const oldMedia = await createMedia('old.jpg');
    oldMediaId = oldMedia.id;
    const newMedia = await createMedia('new.jpg');
    newMediaId = newMedia.id;
    const sharedMedia = await createMedia('shared.jpg');
    sharedMediaId = sharedMedia.id;
    const deleted = await createMedia('deleted.jpg', true);
    deletedMediaId = deleted.id;
    await prisma.merchMedia.updateMany({
      where: { id: { in: [oldMediaId, sharedMediaId] } },
      data: { publishedAt: new Date() },
    });

    oldSnapshot = heroSnapshot('Old homepage', [
      { mediaId: oldMediaId, slot: 'HERO_DESKTOP' },
      { mediaId: sharedMediaId, slot: 'BANNER' },
    ]);
    newSnapshot = heroSnapshot('New homepage', [
      { mediaId: newMediaId, slot: 'HERO_DESKTOP' },
      { mediaId: sharedMediaId, slot: 'BANNER' },
    ]);
    scheduledSnapshot = newSnapshot;

    const current = await createPublication({
      version: 100,
      status: 'PUBLISHED',
      snapshot: oldSnapshot,
    });
    currentPublicationId = current.id;
    const scheduled = await createPublication({
      version: 101,
      status: 'SCHEDULED',
      snapshot: scheduledSnapshot,
      publishAt: new Date(Date.now() - 60_000),
    });
    scheduledPublicationId = scheduled.id;
  });

  afterAll(async () => {
    await prisma.homepagePublication.deleteMany({
      where: { id: { in: publicationIds } },
    });
    await prisma.homepageDraft.deleteMany({ where: { id: 'homepage' } });
    await prisma.merchCampaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.merchMedia.deleteMany({ where: { id: { in: mediaIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: publicationIds } },
          { userId: HOMEPAGE_ACTIVATION_SYSTEM_ACTOR },
          { userId: 'test-immediate' },
          { userId: 'test-media' },
          { userId: 'test-admin' },
        ],
      },
    });
    await app.close();
    if (originalActivationEnv === undefined) {
      delete process.env.HOMEPAGE_ACTIVATION_ENABLED;
    } else {
      process.env.HOMEPAGE_ACTIVATION_ENABLED = originalActivationEnv;
    }
  });

  it('keeps the old publication public before activation', async () => {
    cache.clear();
    const res = await request(app.getHttpServer()).get(BASE).expect(200);
    expect(res.body.version).toBe(100);
    const hero = (res.body.sections as Array<Record<string, unknown>>).find(
      (section) => section.key === 'hero',
    ) as { slides: Array<{ titleFa: string; desktopImageUrl: string }> };
    expect(hero.slides[0]!.titleFa).toBe('Old homepage');
    expect(hero.slides[0]!.desktopImageUrl).toContain(oldMediaId);
  });

  it('activates a due publication atomically and refreshes the public homepage', async () => {
    cache.clear();
    const before = await request(app.getHttpServer()).get(BASE).expect(200);
    const beforeEtag = before.headers.etag as string;
    const oldPublishedAt = (await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: scheduledPublicationId },
    })).publishedAt;
    expect(oldPublishedAt).toBeNull();

    const run = await activation.runDue(new Date(), 10);
    expect(run.activated).toBe(1);

    const old = await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: currentPublicationId },
    });
    expect(old.status).toBe('SUPERSEDED');
    const activated = await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: scheduledPublicationId },
    });
    expect(activated.status).toBe('PUBLISHED');
    expect(activated.publishAt).toBeNull();
    expect(activated.publishedAt).not.toBeNull();
    expect(activated.sections).toEqual(scheduledSnapshot);

    const media = await prisma.merchMedia.findMany({
      where: { id: { in: [oldMediaId, newMediaId, sharedMediaId] } },
    });
    const byId = new Map(media.map((row) => [row.id, row]));
    expect(byId.get(oldMediaId)?.publishedAt).toBeNull();
    expect(byId.get(newMediaId)?.publishedAt).not.toBeNull();
    expect(byId.get(sharedMediaId)?.publishedAt).not.toBeNull();

    cache.clear();
    const after = await request(app.getHttpServer()).get(BASE).expect(200);
    expect(after.body.version).toBe(101);
    const hero = (after.body.sections as Array<Record<string, unknown>>).find(
      (section) => section.key === 'hero',
    ) as { slides: Array<{ titleFa: string; desktopImageUrl: string }> };
    expect(hero.slides[0]!.titleFa).toBe('New homepage');
    expect(hero.slides[0]!.desktopImageUrl).toContain(newMediaId);
    expect(after.headers.etag).not.toBe(beforeEtag);

    const successAudits = await prisma.auditLog.count({
      where: {
        action: 'HOMEPAGE_SCHEDULED_ACTIVATED',
        entityId: scheduledPublicationId,
      },
    });
    expect(successAudits).toBe(1);
  });

  it('is idempotent across repeated worker ticks', async () => {
    const before = await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: scheduledPublicationId },
    });
    const run = await activation.runDue(new Date(), 10);
    expect(run.due).toBe(0);
    expect(run.activated).toBe(0);
    const after = await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: scheduledPublicationId },
    });
    expect(after.status).toBe('PUBLISHED');
    expect(after.version).toBe(before.version);
    expect(after.publishedAt?.toISOString()).toBe(before.publishedAt?.toISOString());
    const successAudits = await prisma.auditLog.count({
      where: {
        action: 'HOMEPAGE_SCHEDULED_ACTIVATED',
        entityId: scheduledPublicationId,
      },
    });
    expect(successAudits).toBe(1);
  });

  it('ignores future, cancelled, and already transitioned publications', async () => {
    const future = await createPublication({
      status: 'SCHEDULED',
      snapshot: oldSnapshot,
      publishAt: new Date(Date.now() + 3_600_000),
    });
    const cancelled = await createPublication({
      status: 'CANCELLED',
      snapshot: oldSnapshot,
    });
    const superseded = await createPublication({
      status: 'SUPERSEDED',
      snapshot: oldSnapshot,
    });

    const run = await activation.runDue(new Date(), 10);
    expect(run.due).toBe(0);
    expect(run.activated).toBe(0);

    const futureResult = await activation.activateById(future.id, {
      now: new Date(),
    });
    expect(futureResult.outcome).toBe('skipped');
    expect(futureResult.reason).toBe('NOT_DUE');
    expect((await activation.activateById(cancelled.id)).outcome).toBe('skipped');
    expect((await activation.activateById(superseded.id)).outcome).toBe('skipped');
    expect((await activation.activateById(scheduledPublicationId)).outcome).toBe(
      'skipped',
    );
  });

  it('blocks invalid snapshots without changing the current publication or media', async () => {
    cache.clear();
    const currentBefore = await currentPublished();
    const mediaBefore = await prisma.merchMedia.findMany({
      where: { id: { in: [oldMediaId, newMediaId, sharedMediaId] } },
      select: { id: true, publishedAt: true },
    });
    const invalid = await createPublication({
      status: 'SCHEDULED',
      snapshot: { schemaVersion: 99, sections: [] },
      schemaVersion: 99,
      publishAt: new Date(Date.now() - 60_000),
    });

    const run = await activation.runDue(new Date(), 10);
    expect(run.blocked).toBe(1);
    const row = await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: invalid.id },
    });
    expect(row.status).toBe('CANCELLED');
    expect((await currentPublished()).id).toBe(currentBefore.id);
    const mediaAfter = await prisma.merchMedia.findMany({
      where: { id: { in: [oldMediaId, newMediaId, sharedMediaId] } },
      select: { id: true, publishedAt: true },
    });
    expect(mediaAfter).toEqual(mediaBefore);
    const blockedAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'HOMEPAGE_SCHEDULED_ACTIVATION_BLOCKED',
        entityId: invalid.id,
      },
    });
    expect(blockedAudit).not.toBeNull();
  });

  it('persists a system-attributed audit when activation fails unexpectedly', async () => {
    const due = await createPublication({
      status: 'SCHEDULED',
      snapshot: heroSnapshot('Transient failure', [
        { mediaId: newMediaId, slot: 'HERO_DESKTOP' },
      ]),
      publishAt: new Date(Date.now() - 60_000),
    });
    const spy = jest
      .spyOn(sourceService, 'validateSnapshot')
      .mockRejectedValueOnce(new Error('injected eligibility failure'));

    try {
      await expect(activation.activateById(due.id)).rejects.toThrow(
        'injected eligibility failure',
      );
    } finally {
      spy.mockRestore();
      await prisma.homepagePublication.update({
        where: { id: due.id },
        data: { status: 'CANCELLED' },
      });
    }

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'HOMEPAGE_SCHEDULED_ACTIVATION_FAILED',
        entityId: due.id,
        userId: HOMEPAGE_ACTIVATION_SYSTEM_ACTOR,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.after).toEqual(
      expect.objectContaining({
        status: 'SCHEDULED',
        errorCode: 'Error',
      }),
    );
  });

  it('blocks missing, deleted, and slot-ineligible media without activating', async () => {
    cache.clear();
    const currentBefore = await currentPublished();
    const mediaBefore = await prisma.merchMedia.findMany({
      where: { id: { in: [oldMediaId, newMediaId, sharedMediaId] } },
      select: { id: true, publishedAt: true },
    });

    const missing = await createPublication({
      status: 'SCHEDULED',
      snapshot: heroSnapshot('Missing media', [
        { mediaId: randomUUID(), slot: 'HERO_DESKTOP' },
      ]),
      publishAt: new Date(Date.now() - 60_000),
    });
    const deleted = await createPublication({
      status: 'SCHEDULED',
      snapshot: heroSnapshot('Deleted media', [
        { mediaId: deletedMediaId, slot: 'HERO_DESKTOP' },
      ]),
      publishAt: new Date(Date.now() - 60_000),
    });
    const existingBanner = await createMedia('banner-only.jpg');
    const noDesktop = await createPublication({
      status: 'SCHEDULED',
      snapshot: heroSnapshot('No desktop', [
        { mediaId: existingBanner.id, slot: 'BANNER' },
      ]),
      publishAt: new Date(Date.now() - 60_000),
    });

    const run = await activation.runDue(new Date(), 10);
    expect(run.blocked).toBe(3);
    for (const id of [missing.id, deleted.id, noDesktop.id]) {
      const row = await prisma.homepagePublication.findUniqueOrThrow({
        where: { id },
      });
      expect(row.status).toBe('CANCELLED');
    }
    expect((await currentPublished()).id).toBe(currentBefore.id);
    const mediaAfter = await prisma.merchMedia.findMany({
      where: { id: { in: [oldMediaId, newMediaId, sharedMediaId] } },
      select: { id: true, publishedAt: true },
    });
    expect(mediaAfter).toEqual(mediaBefore);
  });

  it('blocks disabled, archived, not-yet-started, and expired campaigns', async () => {
    const now = new Date();
    const cases: Array<{
      state: string;
      data: {
        isEnabled?: boolean;
        archivedAt?: Date;
        startsAt?: Date;
        endsAt?: Date;
      };
      code: string;
    }> = [
      {
        state: 'disabled',
        data: { isEnabled: false },
        code: 'CAMPAIGN_DISABLED',
      },
      {
        state: 'archived',
        data: { archivedAt: new Date(now.getTime() - 60_000) },
        code: 'CAMPAIGN_ARCHIVED',
      },
      {
        state: 'not-started',
        data: {
          startsAt: new Date(now.getTime() + 3_600_000),
          endsAt: new Date(now.getTime() + 7_200_000),
        },
        code: 'CAMPAIGN_NOT_STARTED',
      },
      {
        state: 'expired',
        data: {
          startsAt: new Date(now.getTime() - 7_200_000),
          endsAt: new Date(now.getTime() - 3_600_000),
        },
        code: 'CAMPAIGN_EXPIRED',
      },
    ];

    for (const item of cases) {
      const campaign = await prisma.merchCampaign.create({
        data: {
          internalName: token(`activation-${item.state}`),
          type: 'SEASONAL',
          titleFa: `Campaign ${item.state}`,
          ...item.data,
        },
      });
      campaignIds.push(campaign.id);
      const due = await createPublication({
        status: 'SCHEDULED',
        snapshot: heroSnapshot(
          `Campaign ${item.state}`,
          [{ mediaId: newMediaId, slot: 'HERO_DESKTOP' }],
          campaign.id,
        ),
        publishAt: new Date(now.getTime() - 60_000),
      });

      const result = await activation.activateById(due.id, { now });
      expect(result.outcome).toBe('blocked');
      expect(result.reason).toBe('DEPENDENCIES_INVALID');
      const row = await prisma.homepagePublication.findUniqueOrThrow({
        where: { id: due.id },
      });
      expect(row.status).toBe('CANCELLED');
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'HOMEPAGE_SCHEDULED_ACTIVATION_BLOCKED',
          entityId: due.id,
        },
      });
      expect(
        (audit?.after as { dependencyCodes?: string[] } | null)
          ?.dependencyCodes,
      ).toContain(item.code);
    }
  });

  it('activates multiple due publications in deterministic version order', async () => {
    const samePublishAt = new Date(Date.now() - 120_000);
    const dueFirst = await createPublication({
      status: 'SCHEDULED',
      snapshot: heroSnapshot('Due first', [
        { mediaId: newMediaId, slot: 'HERO_DESKTOP' },
        { mediaId: sharedMediaId, slot: 'BANNER' },
      ]),
      publishAt: samePublishAt,
    });
    const dueSecond = await createPublication({
      status: 'SCHEDULED',
      snapshot: heroSnapshot('Due second', [
        { mediaId: oldMediaId, slot: 'HERO_DESKTOP' },
        { mediaId: sharedMediaId, slot: 'BANNER' },
      ]),
      publishAt: samePublishAt,
    });

    const run = await activation.runDue(new Date(), 10);
    expect(run.activated).toBe(2);
    expect((await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: dueFirst.id },
    })).status).toBe('SUPERSEDED');
    const current = await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: dueSecond.id },
    });
    expect(current.status).toBe('PUBLISHED');
    expect(current.version).toBeGreaterThan(dueFirst.version);
    expect((await currentPublished()).id).toBe(dueSecond.id);

    const media = await prisma.merchMedia.findMany({
      where: { id: { in: [oldMediaId, newMediaId, sharedMediaId] } },
    });
    const byId = new Map(media.map((row) => [row.id, row]));
    expect(byId.get(oldMediaId)?.publishedAt).not.toBeNull();
    expect(byId.get(newMediaId)?.publishedAt).toBeNull();
    expect(byId.get(sharedMediaId)?.publishedAt).not.toBeNull();
  });

  it('does not let an older due schedule replace a newer current version', async () => {
    const currentBefore = await currentPublished();
    const mediaBefore = await prisma.merchMedia.findMany({
      where: { id: { in: [oldMediaId, newMediaId, sharedMediaId] } },
      select: { id: true, publishedAt: true },
    });
    const older = await createPublication({
      version: 50,
      status: 'SCHEDULED',
      snapshot: heroSnapshot('Older schedule', [
        { mediaId: newMediaId, slot: 'HERO_DESKTOP' },
      ]),
      publishAt: new Date(Date.now() - 60_000),
    });

    const run = await activation.runDue(new Date(), 10);
    expect(run.blocked).toBe(1);
    const row = await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: older.id },
    });
    expect(row.status).toBe('CANCELLED');
    expect((await currentPublished()).id).toBe(currentBefore.id);
    const mediaAfter = await prisma.merchMedia.findMany({
      where: { id: { in: [oldMediaId, newMediaId, sharedMediaId] } },
      select: { id: true, publishedAt: true },
    });
    expect(mediaAfter).toEqual(mediaBefore);
  });

  it('honours bounded batches and advances on the next tick', async () => {
    const batch: Array<{ id: string }> = [];
    for (const [index, title] of ['Batch 1', 'Batch 2', 'Batch 3'].entries()) {
      batch.push(
        await createPublication({
          status: 'SCHEDULED',
          snapshot: heroSnapshot(title, [
            {
              mediaId: index === 1 ? oldMediaId : newMediaId,
              slot: 'HERO_DESKTOP',
            },
          ]),
          publishAt: new Date(Date.now() - 60_000),
        }),
      );
    }

    const first = await activation.runDue(new Date(), 2);
    expect(first.due).toBe(2);
    expect(first.activated).toBe(2);
    expect(first.hasMore).toBe(true);
    expect((await currentPublished()).id).toBe(batch[1]!.id);

    const second = await activation.runDue(new Date(), 2);
    expect(second.due).toBe(1);
    expect(second.activated).toBe(1);
    expect(second.hasMore).toBe(false);
    expect((await currentPublished()).id).toBe(batch[2]!.id);
  });

  it('allows only one of two concurrent activation attempts', async () => {
    const due = await createPublication({
      status: 'SCHEDULED',
      snapshot: heroSnapshot('Concurrent', [
        { mediaId: newMediaId, slot: 'HERO_DESKTOP' },
      ]),
      publishAt: new Date(Date.now() - 60_000),
    });
    const now = new Date();
    const results = await Promise.all([
      activation.activateById(due.id, { now }),
      activation.activateById(due.id, { now }),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual([
      'activated',
      'skipped',
    ]);
    const row = await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: due.id },
    });
    expect(row.status).toBe('PUBLISHED');
    expect(row.publishedAt).not.toBeNull();
    const successAudits = await prisma.auditLog.count({
      where: {
        action: 'HOMEPAGE_SCHEDULED_ACTIVATED',
        entityId: due.id,
      },
    });
    expect(successAudits).toBe(1);
  });

  it('serializes activation against immediate publication at a higher version', async () => {
    const due = await createPublication({
      status: 'SCHEDULED',
      snapshot: heroSnapshot('Older scheduled', [
        { mediaId: newMediaId, slot: 'HERO_DESKTOP' },
      ]),
      publishAt: new Date(Date.now() - 60_000),
    });
    const [activationResult, immediateResult] = await Promise.allSettled([
      activation.activateById(due.id),
      publications.publish('test-immediate', {}),
    ]);
    expect(activationResult.status).toBe('fulfilled');
    expect(immediateResult.status).toBe('fulfilled');
    if (immediateResult.status === 'fulfilled') {
      publicationIds.push(immediateResult.value.id);
    }
    const current = await currentPublished();
    expect(current.version).toBeGreaterThan(due.version);
    const scheduled = await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: due.id },
    });
    expect(['SUPERSEDED', 'CANCELLED']).toContain(scheduled.status);
    const published = await prisma.homepagePublication.count({
      where: { status: 'PUBLISHED' },
    });
    expect(published).toBe(1);
  });

  it('cannot expose media deleted during the activation race', async () => {
    const racedMedia = await createMedia('raced.jpg');
    const due = await createPublication({
      status: 'SCHEDULED',
      snapshot: heroSnapshot('Media race', [
        { mediaId: racedMedia.id, slot: 'HERO_DESKTOP' },
      ]),
      publishAt: new Date(Date.now() - 60_000),
    });

    const [activationResult, deleteResult] = await Promise.allSettled([
      activation.activateById(due.id),
      mediaService.remove(racedMedia.id, 'test-media'),
    ]);
    expect(activationResult.status).toBe('fulfilled');
    if (activationResult.status === 'fulfilled') {
      if (activationResult.value.outcome === 'activated') {
        expect(deleteResult.status).toBe('rejected');
        if (deleteResult.status === 'rejected') {
          expect(deleteResult.reason).toBeInstanceOf(ConflictException);
        }
        const media = await prisma.merchMedia.findUniqueOrThrow({
          where: { id: racedMedia.id },
        });
        expect(media.deletedAt).toBeNull();
        expect(media.publishedAt).not.toBeNull();
        const row = await prisma.homepagePublication.findUniqueOrThrow({
          where: { id: due.id },
        });
        expect(row.status).toBe('PUBLISHED');
      } else {
        expect(deleteResult.status).toBe('fulfilled');
        const media = await prisma.merchMedia.findUniqueOrThrow({
          where: { id: racedMedia.id },
        });
        expect(media.deletedAt).not.toBeNull();
        expect(media.publishedAt).toBeNull();
        const row = await prisma.homepagePublication.findUniqueOrThrow({
          where: { id: due.id },
        });
        expect(row.status).toBe('CANCELLED');
      }
    }
  });

  it('resolves activation and manual cancellation without corrupting state', async () => {
    const due = await createPublication({
      status: 'SCHEDULED',
      snapshot: heroSnapshot('Cancel race', [
        { mediaId: newMediaId, slot: 'HERO_DESKTOP' },
      ]),
      publishAt: new Date(Date.now() - 60_000),
    });
    const [activationResult, cancelResult] = await Promise.allSettled([
      activation.activateById(due.id),
      publications.cancel(due.id, 'test-admin'),
    ]);
    expect(activationResult.status).toBe('fulfilled');
    expect(['fulfilled', 'rejected']).toContain(cancelResult.status);
    const row = await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: due.id },
    });
    if (row.status === 'PUBLISHED') {
      expect(cancelResult.status).toBe('rejected');
      if (cancelResult.status === 'rejected') {
        expect(cancelResult.reason).toBeInstanceOf(ConflictException);
      }
      if (activationResult.status === 'fulfilled') {
        expect(activationResult.value.outcome).toBe('activated');
      }
    } else {
      expect(row.status).toBe('CANCELLED');
      expect(cancelResult.status).toBe('fulfilled');
      if (activationResult.status === 'fulfilled') {
        expect(activationResult.value.outcome).toBe('skipped');
      }
    }
    expect(
      await prisma.homepagePublication.count({ where: { status: 'PUBLISHED' } }),
    ).toBe(1);
  });

  it('sequentially activates first and then rejects archive usage', async () => {
    const campaign = await prisma.merchCampaign.create({
      data: {
        internalName: token('activation-first'),
        type: 'SEASONAL',
        titleFa: 'Activation first',
      },
    });
    campaignIds.push(campaign.id);
    const campaignMedia = await createMedia('activation-first.jpg');
    const due = await createPublication({
      status: 'SCHEDULED',
      snapshot: heroSnapshot(
        'Activation first',
        [{ mediaId: campaignMedia.id, slot: 'HERO_DESKTOP' }],
        campaign.id,
      ),
      publishAt: new Date(Date.now() - 60_000),
    });

    const activated = await activation.activateById(due.id);
    expect(activated.outcome).toBe('activated');
    await expect(
      campaignService.archive(campaign.id, 'test-admin'),
    ).rejects.toBeInstanceOf(ConflictException);

    const storedCampaign = await prisma.merchCampaign.findUniqueOrThrow({
      where: { id: campaign.id },
    });
    expect(storedCampaign.archivedAt).toBeNull();
    const storedPublication = await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: due.id },
    });
    expect(storedPublication.status).toBe('PUBLISHED');
    expect((await currentPublished()).id).toBe(due.id);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'HOMEPAGE_SCHEDULED_ACTIVATED',
          entityId: due.id,
          userId: HOMEPAGE_ACTIVATION_SYSTEM_ACTOR,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'HOMEPAGE_CAMPAIGN_ARCHIVED',
          entityId: campaign.id,
        },
      }),
    ).toBe(0);
  });

  it('sequentially archives first and blocks later activation eligibility', async () => {
    const campaign = await prisma.merchCampaign.create({
      data: {
        internalName: token('archive-first'),
        type: 'SEASONAL',
        titleFa: 'Archive first',
      },
    });
    campaignIds.push(campaign.id);
    const campaignMedia = await createMedia('archive-first.jpg');
    const currentBefore = await currentPublished();

    const archived = await campaignService.archive(campaign.id, 'test-admin');
    expect(archived.isArchived).toBe(true);
    const due = await createPublication({
      status: 'SCHEDULED',
      snapshot: heroSnapshot(
        'Archive first',
        [{ mediaId: campaignMedia.id, slot: 'HERO_DESKTOP' }],
        campaign.id,
      ),
      publishAt: new Date(Date.now() - 60_000),
    });
    const blocked = await activation.activateById(due.id);
    expect(blocked.outcome).toBe('blocked');
    expect(blocked.reason).toBe('DEPENDENCIES_INVALID');

    const storedCampaign = await prisma.merchCampaign.findUniqueOrThrow({
      where: { id: campaign.id },
    });
    expect(storedCampaign.archivedAt).not.toBeNull();
    const storedPublication = await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: due.id },
    });
    expect(storedPublication.status).toBe('CANCELLED');
    expect((await currentPublished()).id).toBe(currentBefore.id);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'HOMEPAGE_SCHEDULED_ACTIVATION_BLOCKED',
          entityId: due.id,
          userId: HOMEPAGE_ACTIVATION_SYSTEM_ACTOR,
        },
      }),
    ).toBe(1);
    const archiveAudits = await prisma.auditLog.findMany({
      where: { action: 'MERCH_CAMPAIGN_ARCHIVED', entityId: campaign.id },
      select: { userId: true },
    });
    expect(archiveAudits).toHaveLength(1);
    expect(archiveAudits[0]!.userId).toBe('test-admin');
  });

  it('archive acquires the lifecycle lock first, is rejected, and then activation succeeds', async () => {
    const campaign = await prisma.merchCampaign.create({
      data: {
        internalName: token('archive-lock-first'),
        type: 'SEASONAL',
        titleFa: 'Archive lock first',
      },
    });
    campaignIds.push(campaign.id);
    const campaignMedia = await createMedia('archive-lock-first.jpg');
    const due = await createPublication({
      status: 'SCHEDULED',
      snapshot: heroSnapshot(
        'Archive lock first',
        [{ mediaId: campaignMedia.id, slot: 'HERO_DESKTOP' }],
        campaign.id,
      ),
      publishAt: new Date(Date.now() - 60_000),
    });

    const archiveLockAcquired = deferred();
    const releaseArchive = deferred();
    const activationAttempted = deferred();
    let activationAcquired = false;
    let lockCalls = 0;

    const realLock = campaignLifecycle.lockCampaignLifecycle;
    const lockSpy = jest
      .spyOn(campaignLifecycle, 'lockCampaignLifecycle')
      .mockImplementation(async (tx) => {
        lockCalls += 1;
        if (lockCalls === 1) {
          // Archive: acquire the real advisory lock, then hold the transaction
          // open until the test has started and observed activation waiting.
          await realLock(tx);
          archiveLockAcquired.resolve();
          await releaseArchive.promise;
          return;
        }
        if (lockCalls === 2) {
          // Activation: initiate the real lock attempt, signal the test, then
          // await the real acquisition. It cannot pass while archive holds it.
          const attempt = realLock(tx);
          activationAttempted.resolve();
          await attempt;
          activationAcquired = true;
          return;
        }
        await realLock(tx);
      });
    const validationSpy = jest.spyOn(sourceService, 'validateSnapshot');

    let archiveOutcome: Promise<
      | { status: 'fulfilled'; value: unknown }
      | { status: 'rejected'; error: unknown }
    > | null = null;
    let activationPromise: Promise<unknown> | null = null;
    try {
      const archivePromise = campaignService
        .archive(campaign.id, 'test-admin')
        .then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (error) => ({ status: 'rejected' as const, error }),
        );
      archiveOutcome = archivePromise;

      await archiveLockAcquired.promise;
      const activationRun = activation.activateById(due.id);
      activationPromise = activationRun;
      await activationAttempted.promise;

      // Archive holds the real campaign lifecycle advisory lock. Activation has
      // initiated its real lock acquisition but cannot have acquired it or
      // reached snapshot validation.
      expect(activationAcquired).toBe(false);
      expect(validationSpy).not.toHaveBeenCalled();

      releaseArchive.resolve();

      const archived = await archivePromise;
      expect(archived.status).toBe('rejected');
      if (archived.status !== 'rejected') {
        throw new Error('archive unexpectedly succeeded');
      }
      expect(archived.error).toBeInstanceOf(ConflictException);
      expect((archived.error as ConflictException).getResponse()).toMatchObject({
        error: 'MERCH_CAMPAIGN_IN_USE',
      });

      const activated = await activationRun;
      expect(activated).toMatchObject({ outcome: 'activated' });
      expect(activationAcquired).toBe(true);

      const storedCampaign = await prisma.merchCampaign.findUniqueOrThrow({
        where: { id: campaign.id },
      });
      expect(storedCampaign.archivedAt).toBeNull();
      const storedPublication = await prisma.homepagePublication.findUniqueOrThrow({
        where: { id: due.id },
      });
      expect(storedPublication.status).toBe('PUBLISHED');
      expect((await currentPublished()).id).toBe(due.id);
      expect(JSON.stringify(storedPublication.sections)).toContain(campaign.id);

      expect(
        await prisma.auditLog.count({
          where: {
            action: 'MERCH_CAMPAIGN_ARCHIVED',
            entityId: campaign.id,
          },
        }),
      ).toBe(0);
      expect(
        await prisma.auditLog.count({
          where: {
            action: 'HOMEPAGE_SCHEDULED_ACTIVATED',
            entityId: due.id,
            userId: HOMEPAGE_ACTIVATION_SYSTEM_ACTOR,
          },
        }),
      ).toBe(1);
      expect(
        await prisma.auditLog.count({
          where: {
            action: 'HOMEPAGE_SCHEDULED_ACTIVATION_BLOCKED',
            entityId: due.id,
          },
        }),
      ).toBe(0);
    } finally {
      releaseArchive.resolve();
      await Promise.allSettled(
        [archiveOutcome, activationPromise].filter(
          (promise): promise is Promise<unknown> => promise !== null,
        ),
      );
      validationSpy.mockRestore();
      lockSpy.mockRestore();
    }
  });

  it('publishes media from visible sections only', async () => {
    const visibleOnly = await createMedia('visible-only.jpg');
    const hiddenOnly = await createMedia('hidden-only.jpg');
    const shared = await createMedia('shared-visible-hidden.jpg');
    await prisma.merchMedia.update({
      where: { id: hiddenOnly.id },
      data: { publishedAt: new Date() },
    });

    const visibleSnapshot = heroSnapshot('Visible media', [
      { mediaId: visibleOnly.id, slot: 'HERO_DESKTOP' },
      { mediaId: shared.id, slot: 'BANNER' },
    ]) as unknown as {
      schemaVersion: number;
      sections: Array<Record<string, unknown>>;
    };
    const hiddenSnapshot = heroSnapshot('Hidden media', [
      { mediaId: hiddenOnly.id, slot: 'HERO_DESKTOP' },
      { mediaId: shared.id, slot: 'BANNER' },
    ]) as unknown as {
      schemaVersion: number;
      sections: Array<Record<string, unknown>>;
    };
    const hiddenSection = hiddenSnapshot.sections[0]!;
    hiddenSection.key = 'hidden-hero';
    hiddenSection.order = 1;
    hiddenSection.isVisible = false;

    const due = await createPublication({
      status: 'SCHEDULED',
      snapshot: {
        schemaVersion: 1,
        sections: [...visibleSnapshot.sections, hiddenSection],
      },
      publishAt: new Date(Date.now() - 60_000),
    });

    const result = await activation.activateById(due.id);
    expect(result.outcome).toBe('activated');
    const media = await prisma.merchMedia.findMany({
      where: {
        id: { in: [visibleOnly.id, hiddenOnly.id, shared.id] },
      },
      select: { id: true, publishedAt: true },
    });
    const byId = new Map(media.map((row) => [row.id, row]));
    expect(byId.get(visibleOnly.id)?.publishedAt).not.toBeNull();
    expect(byId.get(hiddenOnly.id)?.publishedAt).toBeNull();
    expect(byId.get(shared.id)?.publishedAt).not.toBeNull();

    cache.clear();
    const publicHomepage = await request(app.getHttpServer())
      .get(BASE)
      .expect(200);
    expect(
      (publicHomepage.body.sections as Array<{ key: string }>).some(
        (section) => section.key === 'hidden-hero',
      ),
    ).toBe(false);
  });

  it('does not duplicate audit events on subsequent ticks', async () => {
    const current = await currentPublished();
    const auditsBefore = await prisma.auditLog.count({
      where: {
        action: 'HOMEPAGE_SCHEDULED_ACTIVATED',
        entityId: current.id,
      },
    });
    const run = await activation.runDue(new Date(), 10);
    expect(run.due).toBe(0);
    const auditsAfter = await prisma.auditLog.count({
      where: {
        action: 'HOMEPAGE_SCHEDULED_ACTIVATED',
        entityId: current.id,
      },
    });
    expect(auditsAfter).toBe(auditsBefore);
    expect((await currentPublished()).version).toBe(current.version);
  });
});
