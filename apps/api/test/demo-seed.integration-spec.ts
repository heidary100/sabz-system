import { createHash, randomUUID } from 'crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Readable } from 'stream';
import { NotFoundException, StreamableFile } from '@nestjs/common';
import { Prisma, PrismaClient, ProductCondition, ProductStatus } from '@prisma/client';
import { MERCH_HOMEPAGE_DRAFT_ID } from '@sabz/types';
import sharp from 'sharp';
import {
  DemoSeedLockUnavailableError,
  PrismaDemoSeedGuardrails,
  completeDemoSeedOperationWithinTransaction,
} from '../src/modules/merchandising/demo-seed/guardrails';
import { CampaignService } from '../src/modules/merchandising/campaigns/campaign.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { runReadOnlyTransaction } from '../src/modules/merchandising/demo-seed/read-only';
import { readDatabaseIdentity } from '../src/modules/merchandising/demo-seed/identity';
import {
  lockHomepagePublicationSources,
} from '../src/modules/merchandising/lifecycle-locks';
import { reconcilePublishedMediaEligibility } from '../src/modules/merchandising/homepage/homepage-media-eligibility';
import { MerchMediaService } from '../src/modules/merchandising/media/merch-media.service';
import { PublicMerchMediaController } from '../src/modules/merchandising/media/public-merch-media.controller';
import { MediaStorageConflictError } from '../src/modules/merchandising/media/idempotent-media-storage';
import { createPrismaDemoSeedWriteGateway } from '../src/modules/merchandising/demo-seed/write-gateway';
import { buildDemoSeedPlan } from '../src/modules/merchandising/demo-seed/planner';
import {
  buildDemoSeedIntent,
  computeAssetsIntent,
} from '../src/modules/merchandising/demo-seed/intent';
import { inspectAsset } from '../src/modules/merchandising/demo-seed/asset';
import { expectedMediaOriginalName } from '../src/modules/merchandising/demo-seed/ownership';
import {
  activateFinalBlogRows,
  lockAndValidateFinalBlogRows,
} from '../src/modules/merchandising/demo-seed/blog-finalization';
import { sanitizeRichText } from '../src/modules/products/description-sanitize';
import { LocalDiskMediaStorage } from '../src/modules/products/storage/local-disk-media.storage';
import { ImageProcessorService } from '../src/modules/products/media-processing/image-processor.service';
import { MediaProcessingService } from '../src/modules/products/media-processing/media-processing.service';
import { VideoProcessorService } from '../src/modules/products/media-processing/video-processor.service';
import { FfmpegRunner } from '../src/modules/products/media-processing/ffmpeg.runner';
import { WatermarkOverlayService } from '../src/modules/products/media-processing/watermark-overlay.service';
import { resolveWatermarkConfig } from '../src/modules/products/media-processing/watermark-config';
import type {
  DemoSeedBaselineIntent,
  DemoSeedIntentPayload,
  DemoSeedJournalIntent,
} from '../src/modules/merchandising/demo-seed/types';
import {
  DemoSeedService,
  type DemoSeedWriteGatewayFactory,
} from '../src/modules/merchandising/demo-seed/demo-seed.service';
import {
  PrismaDemoSeedPlanLoader,
  type DemoSeedPlanLoader,
} from '../src/modules/merchandising/demo-seed/plan-loader';
import {
  approvedManifest,
  options as fixtureOptions,
  planInput,
} from '../src/modules/merchandising/demo-seed/test-fixtures';
import { resolveDemoSeedTestUrl } from './demo-seed-isolation';
import {
  assertHomepageDraftRestored,
  assertHomepagePublicationStatusRestored,
  assertMerchMediaMetadataRestored,
  finalizeCleanup,
  restoreHomepageDraft,
  restoreHomepagePublicationStatus,
  restoreMerchMediaMetadata,
  runCleanupActions,
  type CleanupAction,
  type HomepagePublicationStatusSnapshot,
  type MerchMediaMetadataSnapshot,
} from './demo-seed-cleanup';
import {
  createRealGatewayFixture,
  type RealGatewayScenario,
} from './demo-seed-real-gateway';

/**
 * Real PostgreSQL coverage for the demo-seed fencing and atomic publication.
 *
 * Safety: the dedicated global setup validates DEMO_SEED_INTEGRATION,
 * TEST_DATABASE_URL, the expected host, port, database name and username
 * before the shared test-database setup can connect, create or migrate
 * anything. This suite also revalidates the same guard before constructing
 * Prisma clients.
 */
function intentPayload(operationId: string): DemoSeedIntentPayload {
  return {
    version: 1,
    operationId,
    identity: {
      systemIdentifier: 'integration',
      databaseName: 'integration_test',
      databaseOid: 1,
      postgresVersion: '16',
      fingerprint: 'a'.repeat(64),
    },
    manifestHash: 'b'.repeat(64),
    planHash: 'c'.repeat(64),
    publicationMode: 'publish',
    assets: [],
    mediaReconciliationAckIds: [],
    replaceDraft: true,
    publish: true,
    acknowledgePublicationReplacement: true,
    publicApiBaseUrl: 'https://shop.example.com/api/v1',
    manifest: {} as never,
  };
}

const baselineIntent: DemoSeedBaselineIntent = {
  draft: null,
  publications: [],
  candidates: {
    products: [],
    categories: [],
    brands: [],
    productsByBrand: {},
  },
  campaignPayloads: [],
  sections: [],
  spotlightCategoryId: null,
  mediaReconciliation: {
    affectedIds: [],
    acknowledgedIds: [],
    matchesAck: true,
  },
  publication: {
    action: 'publish',
    supersedes: [],
    currentPublishedVersions: [],
    requiresAck: false,
  },
  draftPlan: {
    action: 'none',
    sourceRevision: null,
    requiresBackup: false,
  },
  publicApiBaseUrl: 'https://shop.example.com/api/v1',
};

function journalIntent(operationId: string): DemoSeedJournalIntent {
  return {
    content: intentPayload(operationId),
    baseline: baselineIntent,
  };
}

function baselineHash(operationId: string): string {
  return hash(`baseline-${operationId}`);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function loadRealGatewayPlan(
  prisma: PrismaClient,
  scenario: RealGatewayScenario,
  operationId: string,
) {
  const identity = await runReadOnlyTransaction(prisma, (tx) =>
    readDatabaseIdentity(tx),
  );
  const demoOptions = fixtureOptions({
    operationId,
    expectedFingerprint: identity.fingerprint,
    assetsDir: scenario.assetsRoot,
    backupDir: scenario.backupRoot,
    mediaReconciliationAckIds: [],
  });
  const loader = new PrismaDemoSeedPlanLoader(prisma);
  let planInputValue = await loader.load(demoOptions, scenario.manifest);
  let plan = buildDemoSeedPlan(planInputValue);
  if (plan.mediaReconciliation.affected.length > 0) {
    demoOptions.mediaReconciliationAckIds =
      plan.mediaReconciliation.affected.map((row) => row.id);
    planInputValue = await loader.load(demoOptions, scenario.manifest);
    plan = buildDemoSeedPlan(planInputValue);
  }
  expect(plan.applyPermitted).toBe(true);
  return { options: demoOptions, loader, plan };
}

function realGatewayService(
  prisma: PrismaClient,
  loader: PrismaDemoSeedPlanLoader,
): DemoSeedService {
  return new DemoSeedService(
    loader,
    (input) =>
      createPrismaDemoSeedWriteGateway({
        prisma: prisma as never,
        ...input,
      }),
    new PrismaDemoSeedGuardrails(prisma, 1_000_000),
  );
}

function publicationFailureTriggerNames(operationId: string): {
  trigger: string;
  fn: string;
} {
  const suffix = operationId.replace(/[^a-zA-Z0-9_]/g, '_');
  return {
    trigger: `ss284b_fail_publication_${suffix}`,
    fn: `ss284b_fail_publication_fn_${suffix}`,
  };
}

async function installPublicationFailureTrigger(
  prisma: PrismaClient,
  operationId: string,
): Promise<void> {
  if (!/^[a-z0-9_-]+$/.test(operationId)) {
    throw new Error('Unsafe operation id for trigger literal.');
  }
  const { trigger, fn } = publicationFailureTriggerNames(operationId);
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION "${fn}"() RETURNS trigger
    LANGUAGE plpgsql AS $body$
    BEGIN
      RAISE EXCEPTION 'forced publication failure for ${operationId}';
    END;
    $body$;
  `);
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS "${trigger}" ON "HomepagePublication";`,
  );
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "${trigger}"
    BEFORE INSERT ON "HomepagePublication"
    FOR EACH ROW
    WHEN (NEW."demoSeedOperationId" = '${operationId}')
    EXECUTE FUNCTION "${fn}"();
  `);
}

async function dropPublicationFailureTrigger(
  prisma: PrismaClient,
  operationId: string,
): Promise<void> {
  const { trigger, fn } = publicationFailureTriggerNames(operationId);
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS "${trigger}" ON "HomepagePublication";`,
  );
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"();`);
}

class RollbackAfterCheck extends Error {
  constructor(readonly observed: unknown) {
    super('rollback after check');
  }
}

describe('demo seed PostgreSQL fencing and publication atomicity', () => {
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  const operationIds: string[] = [];
  const publicationIds: string[] = [];
  const mediaIds: string[] = [];
  const campaignNames: string[] = [];

  beforeAll(async () => {
    const url = resolveDemoSeedTestUrl();
    prismaA = new PrismaClient({ datasourceUrl: url });
    prismaB = new PrismaClient({ datasourceUrl: url });
  });

  // Remove each test's journal/publication rows before the next test. The
  // suite has a database-level "one PUBLISHED publication" constraint, so
  // accumulating publications across tests would make independent test cases
  // fail for reasons unrelated to their assertions.
  afterEach(async () => {
    if (!prismaA) return;
    if (operationIds.length > 0) {
      await prismaA.homepageDemoSeedOperation.deleteMany({
        where: { id: { in: operationIds } },
      });
    }
    if (publicationIds.length > 0) {
      await prismaA.homepagePublication.deleteMany({
        where: { id: { in: publicationIds } },
      });
    }
  });

  afterAll(async () => {
    if (!prismaA || !prismaB) return;
    // Journal publicationId has a restrictive FK. Remove journal rows before
    // their referenced publications.
    if (operationIds.length > 0) {
      await prismaA.homepageDemoSeedOperation.deleteMany({
        where: { id: { in: operationIds } },
      });
    }
    if (publicationIds.length > 0) {
      await prismaA.homepagePublication.deleteMany({
        where: { id: { in: publicationIds } },
      });
    }
    if (campaignNames.length > 0) {
      await prismaA.merchCampaign.deleteMany({
        where: { internalName: { in: campaignNames } },
      });
    }
    if (mediaIds.length > 0) {
      await prismaA.merchMedia.deleteMany({
        where: { id: { in: mediaIds } },
      });
    }
    await prismaA.$disconnect();
    await prismaB.$disconnect();
  });

  it('uses genuinely independent database sessions', async () => {
    const [a] = await prismaA.$queryRaw<Array<{ pid: number }>>`
      SELECT pg_backend_pid() AS pid
    `;
    const [b] = await prismaB.$queryRaw<Array<{ pid: number }>>`
      SELECT pg_backend_pid() AS pid
    `;
    expect(a?.pid).toBeDefined();
    expect(b?.pid).toBeDefined();
    expect(a?.pid).not.toBe(b?.pid);
  });

  it('rejects a stale owner after a newer fencing generation takes over', async () => {
    const stamp = Date.now();
    const opA = `it-fence-a-${stamp}`;
    const opB = `it-fence-b-${stamp}`;
    operationIds.push(opA, opB);
    const guardrailsA = new PrismaDemoSeedGuardrails(prismaA, 1_000_000);
    const guardrailsB = new PrismaDemoSeedGuardrails(prismaB, 1_000_000);
    const lockA = await guardrailsA.acquireLock(opA);
    try {
      const journalA = await guardrailsA.openJournal({
        operationId: opA,
        planHash: hash('plan-a'),
        intentHash: hash('intent-a'),
        baselineHash: baselineHash(opA),
        intent: journalIntent(opA),
        fence: lockA,
      });
      const generationA = lockA.generation;

      await prismaB.$executeRaw`
        UPDATE "HomepageDemoSeedLock"
        SET "leaseExpiresAt" = clock_timestamp() - interval '1 second'
        WHERE "id" = 'homepage-demo'
      `;

      const lockB = await guardrailsB.acquireLock(opB);
      expect(lockB.generation).toBe(generationA + 1);
      try {
        await expect(
          prismaA.$transaction(async (tx) => {
            await lockA.lockWithinTransaction(tx);
            return tx.homepageDemoSeedOperation.count();
          }),
        ).rejects.toThrow(/fencing generation|lease expired|superseded/);

        await expect(journalA.advance('PLANNED')).rejects.toThrow(
          /fencing generation|lease expired|superseded/,
        );
        await expect(
          prismaA.$transaction((tx) =>
            completeDemoSeedOperationWithinTransaction(tx, {
              operationId: opA,
              intentHash: hash('intent-a'),
              expectedState: 'STARTED',
              publicationMode: 'draft',
              publicationId: null,
              publicationVersion: null,
              draftRevision: 1,
              result: {
                draft: {
                  revision: 1,
                  publicationId: null,
                  publicationVersion: null,
                  supersededVersions: [],
                },
              },
              completedAt: new Date(),
              fence: lockA,
            }),
          ),
        ).rejects.toThrow(/fencing generation|lease expired|superseded/);

        const journalB = await guardrailsB.openJournal({
          operationId: opB,
          planHash: hash('plan-b'),
          intentHash: hash('intent-b'),
          baselineHash: baselineHash(opB),
          intent: journalIntent(opB),
          fence: lockB,
        });
        await journalB.advance('PLANNED');
        const row = await prismaA.homepageDemoSeedOperation.findUniqueOrThrow({
          where: { id: opB },
        });
        expect(row.state).toBe('PLANNED');
      } finally {
        await lockB.release();
      }
    } finally {
      await lockA.release();
    }
  });

  it('rejects a stale campaign write through the real service fence', async () => {
    const stamp = Date.now();
    const opA = `it-campaign-a-${stamp}`;
    const opB = `it-campaign-b-${stamp}`;
    operationIds.push(opA, opB);
    const staleName = `homepage-demo:it-stale-${stamp}`;
    const currentName = `homepage-demo:it-current-${stamp}`;
    campaignNames.push(staleName, currentName);
    const guardrailsA = new PrismaDemoSeedGuardrails(prismaA, 1_000_000);
    const guardrailsB = new PrismaDemoSeedGuardrails(prismaB, 1_000_000);
    const lockA = await guardrailsA.acquireLock(opA);
    try {
      await prismaB.$executeRaw`
        UPDATE "HomepageDemoSeedLock"
        SET "leaseExpiresAt" = clock_timestamp() - interval '1 second'
        WHERE "id" = 'homepage-demo'
      `;
      const lockB = await guardrailsB.acquireLock(opB);
      try {
        const campaigns = new CampaignService(
          prismaA as never,
          new AuditService(prismaA as never),
        );
        await expect(
          campaigns.create(
            'homepage-demo-seed',
            {
              internalName: staleName,
              type: 'SEASONAL',
              titleFa: 'تست کهنه',
            },
            undefined,
            lockA,
          ),
        ).rejects.toThrow(/fencing generation|lease expired|superseded/);
        expect(
          await prismaA.merchCampaign.count({
            where: { internalName: staleName },
          }),
        ).toBe(0);

        const currentCampaigns = new CampaignService(
          prismaB as never,
          new AuditService(prismaB as never),
        );
        const created = await currentCampaigns.create(
          'homepage-demo-seed',
          {
            internalName: currentName,
            type: 'SEASONAL',
            titleFa: 'تست جاری',
          },
          undefined,
          lockB,
        );
        expect(created.internalName).toBe(currentName);
      } finally {
        await lockB.release();
      }
    } finally {
      await lockA.release();
    }
  });

  it('does not allow takeover while an earlier protected transaction holds the fence row', async () => {
    const stamp = Date.now();
    const opA = `it-hold-a-${stamp}`;
    const opB = `it-hold-b-${stamp}`;
    operationIds.push(opA, opB);
    const guardrailsA = new PrismaDemoSeedGuardrails(prismaA, 1_000_000);
    const guardrailsB = new PrismaDemoSeedGuardrails(prismaB, 1_000_000);
    const lockA = await guardrailsA.acquireLock(opA);
    try {
      let releaseGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      let signalLocked!: () => void;
      const locked = new Promise<void>((resolve) => {
        signalLocked = resolve;
      });
      const transactionA = prismaA.$transaction(async (tx) => {
        await lockA.lockWithinTransaction(tx);
        signalLocked();
        await gate;
        return tx.homepageDemoSeedOperation.count();
      });
      await locked;

      const acquisitionB = guardrailsB.acquireLock(opB);
      void acquisitionB.catch(() => undefined);
      let settled = false;
      void acquisitionB.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await delay(250);
      expect(settled).toBe(false);

      releaseGate();
      await transactionA;
      await expect(acquisitionB).rejects.toBeInstanceOf(
        DemoSeedLockUnavailableError,
      );
    } finally {
      await lockA.release();
    }
  });

  it('commits publication and authoritative journal completion atomically', async () => {
    const operationId = `it-publication-${Date.now()}`;
    operationIds.push(operationId);
    const intentHash = hash(`intent-${operationId}`);
    const planHash = hash(`plan-${operationId}`);
    await prismaA.homepageDemoSeedOperation.create({
      data: {
        id: operationId,
        state: 'BLOG_DRAFTS_READY',
        planHash,
        intentHash,
        baselineHash: baselineHash(operationId),
        intent: journalIntent(operationId) as never,
        steps: {},
      },
    });

    const max = await prismaA.homepagePublication.aggregate({
      _max: { version: true },
    });
    const version = (max._max.version ?? 0) + 1;
    const guardrails = new PrismaDemoSeedGuardrails(prismaA, 1_000_000);
    const lock = await guardrails.acquireLock(operationId);
    try {
      const publication = await prismaA.$transaction(async (tx) => {
        const created = await tx.homepagePublication.create({
          data: {
            version,
            demoSeedOperationId: operationId,
            status: 'PUBLISHED',
            sections: { schemaVersion: 1, sections: [] } as never,
            schemaVersion: 1,
            sourceDraftRevision: 1,
            publishedAt: new Date(),
          },
        });
        await completeDemoSeedOperationWithinTransaction(tx, {
          operationId,
          intentHash,
          expectedState: 'BLOG_DRAFTS_READY',
          publicationMode: 'publish',
          publicationId: created.id,
          publicationVersion: version,
          draftRevision: 1,
          result: {
            campaigns: {},
            media: {},
            blog: {},
            backup: null,
            draft: {
              revision: 1,
              publicationId: created.id,
              publicationVersion: version,
              supersededVersions: [],
            },
          },
          completedAt: new Date(),
          fence: lock,
        });
        return created;
      });
      publicationIds.push(publication.id);

      const row = await prismaA.homepageDemoSeedOperation.findUniqueOrThrow({
        where: { id: operationId },
      });
      expect(row.state).toBe('COMPLETED');
      expect(row.publicationId).toBe(publication.id);
      expect(row.draftRevision).toBe(1);

      const replay = await guardrails.openJournal({
        operationId,
        planHash,
        intentHash,
        baselineHash: baselineHash(operationId),
        intent: journalIntent(operationId),
        fence: lock,
      });
      expect(replay.completed?.publicationId).toBe(publication.id);
      await expect(
        guardrails.openJournal({
          operationId,
          planHash,
          intentHash: hash('different-intent'),
          baselineHash: baselineHash(operationId),
          intent: journalIntent(operationId),
          fence: lock,
        }),
      ).rejects.toThrow(/different immutable intent/);

      await expect(
        prismaA.homepagePublication.create({
          data: {
            // Far above any version used by the suite, so the only possible
            // conflict is the unique operation-to-publication link.
            version: version + 1_000_000,
            demoSeedOperationId: operationId,
            status: 'PUBLISHED',
            sections: { schemaVersion: 1, sections: [] } as never,
            schemaVersion: 1,
            sourceDraftRevision: 2,
            publishedAt: new Date(),
          },
        }),
      ).rejects.toBeDefined();
    } finally {
      await lock.release();
    }
  });

  it('rejects nonexistent, unrelated or mismatched publications at completion', async () => {
    const stamp = Date.now();
    const missingOp = `it-missing-pub-${stamp}`;
    const unrelatedOp = `it-unrelated-pub-${stamp}`;
    const versionOp = `it-version-pub-${stamp}`;
    operationIds.push(missingOp, unrelatedOp, versionOp);
    const guardrails = new PrismaDemoSeedGuardrails(prismaA, 1_000_000);

    const createJournal = async (operationId: string) => {
      await prismaA.homepageDemoSeedOperation.create({
        data: {
          id: operationId,
          state: 'BLOG_DRAFTS_READY',
          planHash: hash(`plan-${operationId}`),
          intentHash: hash(`intent-${operationId}`),
          baselineHash: baselineHash(operationId),
          intent: journalIntent(operationId) as never,
          steps: {},
        },
      });
    };

    await createJournal(missingOp);
    await createJournal(unrelatedOp);
    await createJournal(versionOp);

    const max = await prismaA.homepagePublication.aggregate({
      _max: { version: true },
    });
    const baseVersion = (max._max.version ?? 0) + 1;

    const unrelatedPublication = await prismaA.homepagePublication.create({
      data: {
        version: baseVersion,
        demoSeedOperationId: unrelatedOp,
        status: 'PUBLISHED',
        sections: { schemaVersion: 1, sections: [] } as never,
        schemaVersion: 1,
        sourceDraftRevision: 1,
        publishedAt: new Date(),
      },
    });
    publicationIds.push(unrelatedPublication.id);

    const versionPublication = await prismaA.homepagePublication.create({
      data: {
        version: baseVersion + 1,
        demoSeedOperationId: versionOp,
        // The surrounding tests assert id/version/operation binding; only one
        // row may be PUBLISHED at a time because of the filtered unique index.
        status: 'SUPERSEDED',
        sections: { schemaVersion: 1, sections: [] } as never,
        schemaVersion: 1,
        sourceDraftRevision: 1,
        publishedAt: new Date(),
      },
    });
    publicationIds.push(versionPublication.id);

    const missingPublicationId = randomUUID();
    const missingVersion = baseVersion + 1_000;
    const missingLock = await guardrails.acquireLock(missingOp);
    try {
      await expect(
        prismaA.$transaction((tx) =>
          completeDemoSeedOperationWithinTransaction(tx, {
            operationId: missingOp,
            intentHash: hash(`intent-${missingOp}`),
            expectedState: 'BLOG_DRAFTS_READY',
            publicationMode: 'publish',
            publicationId: missingPublicationId,
            publicationVersion: missingVersion,
            draftRevision: 1,
            result: {
              draft: {
                revision: 1,
                publicationId: missingPublicationId,
                publicationVersion: missingVersion,
                supersededVersions: [],
              },
            },
            completedAt: new Date(),
            fence: missingLock,
          }),
        ),
      ).rejects.toThrow(/does not exist/);
    } finally {
      await missingLock.release();
    }

    const unrelatedLock = await guardrails.acquireLock(unrelatedOp);
    try {
      await expect(
        prismaA.$transaction((tx) =>
          completeDemoSeedOperationWithinTransaction(tx, {
            operationId: missingOp,
            intentHash: hash(`intent-${missingOp}`),
            expectedState: 'BLOG_DRAFTS_READY',
            publicationMode: 'publish',
            publicationId: unrelatedPublication.id,
            publicationVersion: unrelatedPublication.version,
            draftRevision: 1,
            result: {
              draft: {
                revision: 1,
                publicationId: unrelatedPublication.id,
                publicationVersion: unrelatedPublication.version,
                supersededVersions: [],
              },
            },
            completedAt: new Date(),
            fence: unrelatedLock,
          }),
        ),
      ).rejects.toThrow(/different demo-seed operation/);
    } finally {
      await unrelatedLock.release();
    }

    const versionLock = await guardrails.acquireLock(versionOp);
    try {
      await expect(
        prismaA.$transaction((tx) =>
          completeDemoSeedOperationWithinTransaction(tx, {
            operationId: versionOp,
            intentHash: hash(`intent-${versionOp}`),
            expectedState: 'BLOG_DRAFTS_READY',
            publicationMode: 'publish',
            publicationId: versionPublication.id,
            publicationVersion: versionPublication.version + 1,
            draftRevision: 1,
            result: {
              draft: {
                revision: 1,
                publicationId: versionPublication.id,
                publicationVersion: versionPublication.version + 1,
                supersededVersions: [],
              },
            },
            completedAt: new Date(),
            fence: versionLock,
          }),
        ),
      ).rejects.toThrow(/version does not match/);
    } finally {
      await versionLock.release();
    }

    expect(
      await prismaA.homepageDemoSeedOperation.count({
        where: {
          id: { in: [missingOp, unrelatedOp, versionOp] },
          state: 'COMPLETED',
        },
      }),
    ).toBe(0);
  });

  it('rolls back publication and journal completion together', async () => {
    const operationId = `it-rollback-${Date.now()}`;
    operationIds.push(operationId);
    const intentHash = hash(`rollback-intent-${operationId}`);
    await prismaA.homepageDemoSeedOperation.create({
      data: {
        id: operationId,
        state: 'BLOG_DRAFTS_READY',
        planHash: hash('rollback-plan'),
        intentHash,
        baselineHash: baselineHash(operationId),
        intent: journalIntent(operationId) as never,
        steps: {},
      },
    });
    const max = await prismaA.homepagePublication.aggregate({
      _max: { version: true },
    });
    const version = (max._max.version ?? 0) + 1;
    const guardrails = new PrismaDemoSeedGuardrails(prismaA, 1_000_000);
    const lock = await guardrails.acquireLock(operationId);
    try {
      await expect(
        prismaA.$transaction(async (tx) => {
          const created = await tx.homepagePublication.create({
            data: {
              version,
              demoSeedOperationId: operationId,
              status: 'PUBLISHED',
              sections: { schemaVersion: 1, sections: [] } as never,
              schemaVersion: 1,
              sourceDraftRevision: 1,
              publishedAt: new Date(),
            },
          });
          await completeDemoSeedOperationWithinTransaction(tx, {
            operationId,
            intentHash,
            expectedState: 'BLOG_DRAFTS_READY',
            publicationMode: 'publish',
            publicationId: created.id,
            publicationVersion: version,
            draftRevision: 1,
            result: {
              draft: {
                revision: 1,
                publicationId: created.id,
                publicationVersion: version,
                supersededVersions: [],
              },
            },
            completedAt: new Date(),
            fence: lock,
          });
          throw new Error('forced rollback');
        }),
      ).rejects.toThrow('forced rollback');
    } finally {
      await lock.release();
    }

    expect(
      await prismaA.homepagePublication.count({
        where: { demoSeedOperationId: operationId },
      }),
    ).toBe(0);
    const row = await prismaA.homepageDemoSeedOperation.findUniqueOrThrow({
      where: { id: operationId },
    });
    expect(row.state).toBe('BLOG_DRAFTS_READY');
  });

  it('serializes a normal publication against demo media reconciliation', async () => {
    const stamp = Date.now();
    const publishedId = randomUUID();
    const incomingId = randomUUID();
    mediaIds.push(publishedId, incomingId);
    await prismaA.merchMedia.createMany({
      data: [
        {
          id: publishedId,
          originalName: `operator-published-${stamp}.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: 1,
          storageKey: `merchandising/integration/${publishedId}.jpg`,
          createdBy: 'operator',
          publishedAt: new Date('2026-11-10T00:00:00.000Z'),
        },
        {
          id: incomingId,
          originalName: `operator-incoming-${stamp}.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: 1,
          storageKey: `merchandising/integration/${incomingId}.jpg`,
          createdBy: 'operator',
        },
      ],
    });

    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    let observed: unknown = null;

    const transactionA = prismaA.$transaction(async (tx) => {
      await lockHomepagePublicationSources(tx);
      const before = await tx.merchMedia.findMany({
        where: { publishedAt: { not: null } },
        select: { id: true },
      });
      signalLocked();
      await gate;
      await reconcilePublishedMediaEligibility(
        tx,
        { schemaVersion: 1, sections: [] } as never,
        new Date(),
        'integration',
      );
      const after = await tx.merchMedia.findMany({
        where: { publishedAt: { not: null } },
        select: { id: true },
      });
      observed = { before, after };
      throw new RollbackAfterCheck(observed);
    });

    await locked;
    const transactionB = prismaB.$transaction(async (tx) => {
      await lockHomepagePublicationSources(tx);
      await tx.merchMedia.update({
        where: { id: incomingId },
        data: { publishedAt: new Date() },
      });
    });
    let settled = false;
    void transactionB.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await delay(250);
    expect(settled).toBe(false);

    releaseGate();
    await expect(transactionA).rejects.toBeInstanceOf(RollbackAfterCheck);
    await transactionB;

    expect(observed).not.toBeNull();
    const inTransaction = observed as {
      before: Array<{ id: string }>;
      after: Array<{ id: string }>;
    };
    expect(inTransaction.before.some((row) => row.id === publishedId)).toBe(true);
    expect(inTransaction.after.some((row) => row.id === publishedId)).toBe(false);
    const afterReconcile = await prismaA.merchMedia.findMany({
      where: { id: { in: [publishedId, incomingId] } },
      select: { id: true, publishedAt: true },
    });
    const byId = new Map(afterReconcile.map((row) => [row.id, row.publishedAt]));
    expect(byId.get(publishedId)).not.toBeNull();
    expect(byId.get(incomingId)).not.toBeNull();
    await prismaA.merchMedia.deleteMany({
      where: { id: { in: [publishedId, incomingId] } },
    });
  });

  it('runs the actual apply orchestration and replays a completed operation', async () => {
    const operationId = `it-apply-${Date.now()}`;
    operationIds.push(operationId);
    const manifest = approvedManifest();
    const planInputValue = planInput(manifest, {
      options: fixtureOptions({ operationId }),
    });
    const loader: DemoSeedPlanLoader = {
      load: async () => planInputValue,
    };
    const backup = {
      path: '/tmp/integration-backup.json',
      checksum: 'a'.repeat(64),
      sizeBytes: 10,
    };
    const campaignIds = Object.fromEntries(
      manifest.campaigns.map((campaign) => [
        campaign.key,
        `campaign-${campaign.key}`,
      ]),
    );
    const mediaIds = Object.fromEntries(
      manifest.media.map((asset) => [asset.key, `media-${asset.key}`]),
    );
    const blogIds = Object.fromEntries(
      manifest.blog.map((article) => [article.key, `blog-${article.key}`]),
    );
    let writerCalls = 0;
    const factory: DemoSeedWriteGatewayFactory = ({ fence, intent }) => {
      writerCalls += 1;
      return {
        async upsertCampaign(key) {
          return { id: campaignIds[key]!, action: 'create' };
        },
        async mediaStorageIdentity(key) {
          return {
            action: 'create',
            storageKey: `merchandising/demo/test/${key}.jpg`,
            thumbnailKey: `merchandising/demo/test/${key}.thumb.webp`,
          };
        },
        async uploadOrReuseMedia(key) {
          return {
            id: mediaIds[key]!,
            action: 'create',
            storageAction: 'written',
            storageKey: `merchandising/demo/test/${key}.jpg`,
            thumbnailKey: `merchandising/demo/test/${key}.thumb.webp`,
          };
        },
        async upsertBlogPost(key) {
          return { id: blogIds[key]!, action: 'create' };
        },
        async applyDraftAndPublication() {
          return prismaA.$transaction(async (tx) => {
            await fence.lockWithinTransaction(tx);
            const max = await tx.homepagePublication.aggregate({
              _max: { version: true },
            });
            const version = (max._max.version ?? 0) + 1;
            const publication = await tx.homepagePublication.create({
              data: {
                version,
                demoSeedOperationId: intent.operationId,
                status: 'PUBLISHED',
                sections: { schemaVersion: 1, sections: [] } as never,
                schemaVersion: 1,
                sourceDraftRevision: 1,
                publishedAt: new Date(),
              },
            });
            publicationIds.push(publication.id);
            const draft = {
              revision: 4,
              publicationId: publication.id,
              publicationVersion: version,
              supersededVersions: [],
            };
            await completeDemoSeedOperationWithinTransaction(tx, {
              operationId: intent.operationId,
              intentHash: intent.intentHash,
              expectedState: 'BLOG_DRAFTS_READY',
              publicationMode: 'publish',
              publicationId: publication.id,
              publicationVersion: version,
              draftRevision: 4,
              result: {
                campaigns: campaignIds,
                media: mediaIds,
                blog: blogIds,
                backup,
                draft,
              },
              completedAt: new Date(),
              fence,
            });
            return draft;
          });
        },
      };
    };
    const service = new DemoSeedService(
      loader,
      factory,
      new PrismaDemoSeedGuardrails(prismaA, 1_000_000),
      async () => backup,
    );

    const first = await service.apply(
      fixtureOptions({ operationId }),
      manifest,
    );
    expect(first.replayed).toBe(false);
    expect(first.campaigns).toEqual(campaignIds);
    expect(first.media).toEqual(mediaIds);
    expect(first.blog).toEqual(blogIds);
    expect(writerCalls).toBe(1);

    const row = await prismaA.homepageDemoSeedOperation.findUniqueOrThrow({
      where: { id: operationId },
    });
    expect(row.state).toBe('COMPLETED');
    expect(row.result).not.toBeNull();

    const replay = await service.apply(
      fixtureOptions({ operationId }),
      manifest,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.campaigns).toEqual(campaignIds);
    expect(replay.media).toEqual(mediaIds);
    expect(replay.blog).toEqual(blogIds);
    expect(replay.backup).toEqual(backup);
    expect(writerCalls).toBe(1);
  });

  it('creates a media row only after a fenced upload and reuses a verified orphan', async () => {
    const operationId = `it-media-${Date.now()}`;
    operationIds.push(operationId);
    const root = await mkdtemp(join(tmpdir(), 'demo-seed-media-'));
    const tempDir = join(root, 'tmp');
    await mkdir(tempDir, { recursive: true });
    const source = join(root, 'source.png');
    const different = join(root, 'different.png');
    await writeFile(
      source,
      await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 4,
          background: { r: 10, g: 20, b: 30, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    );
    await writeFile(
      different,
      await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 4,
          background: { r: 200, g: 10, b: 10, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    );

    const storage = new LocalDiskMediaStorage(root);
    const watermark = resolveWatermarkConfig();
    const overlay = new WatermarkOverlayService(watermark);
    const processing = new MediaProcessingService(
      new ImageProcessorService(overlay, watermark),
      new VideoProcessorService(
        overlay,
        new FfmpegRunner(FfmpegRunner.resolveBinary()),
        watermark,
        tempDir,
      ),
      watermark,
    );
    const media = new MerchMediaService(
      prismaA as never,
      new AuditService(prismaA as never),
      storage,
      processing,
      tempDir,
    );
    const guardrails = new PrismaDemoSeedGuardrails(prismaA, 1_000_000);
    const lock = await guardrails.acquireLock(operationId);
    const keys = {
      storageKey: `merchandising/demo/integration/${operationId}.png`,
      thumbnailKey: `merchandising/demo/integration/${operationId}.thumb.webp`,
    };
    const uploadFile = async (
      sourcePath: string,
      originalname: string,
    ): Promise<Express.Multer.File> => {
      const path = join(root, `${randomUUID()}-${originalname}`);
      await copyFile(sourcePath, path);
      return {
        path,
        originalname,
        mimetype: 'image/png',
      } as Express.Multer.File;
    };
    try {
      let firstAction: string | undefined;
      const first = await media.upload(
        await uploadFile(source, 'homepage-demo-integration.png'),
        { altFa: 'integration' },
        'homepage-demo-seed',
        undefined,
        {
          storageKeys: keys,
          fence: lock,
          idempotentStorage: true,
          onStorageAction: (action) => {
            firstAction = action;
          },
        },
      );
      mediaIds.push(first.id);
      expect(firstAction).toBe('written');
      expect(first.publishedAt).toBeNull();
      const firstRow = await prismaA.merchMedia.findUniqueOrThrow({
        where: { id: first.id },
      });
      expect(firstRow.createdBy).toBe('homepage-demo-seed');
      expect(firstRow.storageKey).toBe(keys.storageKey);
      expect(firstRow.thumbnailKey).toBe(keys.thumbnailKey);
      expect(firstRow.sourceSha256).not.toBeNull();
      expect(firstRow.processedSha256).not.toBeNull();
      expect(firstRow.thumbnailSha256).not.toBeNull();

      // Simulate a crash after the binary write but before the media row.
      await prismaA.merchMedia.delete({ where: { id: first.id } });
      let secondAction: string | undefined;
      const recovered = await media.upload(
        await uploadFile(source, 'homepage-demo-integration.png'),
        { altFa: 'integration' },
        'homepage-demo-seed',
        undefined,
        {
          storageKeys: keys,
          fence: lock,
          idempotentStorage: true,
          onStorageAction: (action) => {
            secondAction = action;
          },
        },
      );
      mediaIds.push(recovered.id);
      expect(secondAction).toBe('reused-verified');
      expect(recovered.publishedAt).toBeNull();
      const recoveredRow = await prismaA.merchMedia.findUniqueOrThrow({
        where: { id: recovered.id },
      });
      expect(recoveredRow.storageKey).toBe(keys.storageKey);
      expect(recoveredRow.thumbnailKey).toBe(keys.thumbnailKey);
      expect(recoveredRow.sourceSha256).toBe(firstRow.sourceSha256);
      expect(recoveredRow.processedSha256).toBe(firstRow.processedSha256);
      expect(recoveredRow.thumbnailSha256).toBe(firstRow.thumbnailSha256);

      // A different operation must not overwrite the recorded binary.
      await expect(
        media.upload(
          await uploadFile(
            different,
            'homepage-demo-integration-other.png',
          ),
          { altFa: 'integration' },
          'homepage-demo-seed',
          undefined,
          {
            storageKeys: keys,
            fence: lock,
            idempotentStorage: true,
          },
        ),
      ).rejects.toBeInstanceOf(MediaStorageConflictError);
      expect((await storage.get(keys.storageKey)).byteLength).toBeGreaterThan(0);

      // Public eligibility is set only by the publication reconciliation path.
      // Roll the check back so this isolated test cannot clear publishedAt on
      // rows owned by other integration suites in the same disposable database.
      let publishedAt: Date | null = null;
      await expect(
        prismaA.$transaction(async (tx) => {
          await lockHomepagePublicationSources(tx);
          await reconcilePublishedMediaEligibility(
            tx,
            {
              schemaVersion: 1,
              sections: [
                {
                  key: 'integration',
                  type: 'TRUST_STRIP',
                  order: 0,
                  isVisible: true,
                  settings: {
                    items: [],
                    campaign: { media: [{ mediaId: recovered.id }] },
                  },
                },
              ],
            } as never,
            new Date(),
            'integration',
          );
          const row = await tx.merchMedia.findUniqueOrThrow({
            where: { id: recovered.id },
          });
          publishedAt = row.publishedAt;
          throw new RollbackAfterCheck('public-eligibility-check');
        }),
      ).rejects.toBeInstanceOf(RollbackAfterCheck);
      expect(publishedAt).not.toBeNull();
    } finally {
      await lock.release();
      await prismaA.merchMedia.deleteMany({
        where: { id: { in: mediaIds } },
      });
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reuses gateway media only when provenance and stored bytes verify', async () => {
    const operationId = `it-gateway-media-${Date.now()}`;
    operationIds.push(operationId);
    const assetsRoot = await mkdtemp(join(tmpdir(), 'demo-seed-gateway-assets-'));
    const storageRoot = await mkdtemp(join(tmpdir(), 'demo-seed-gateway-storage-'));
    const tempDir = join(storageRoot, 'tmp');
    await mkdir(tempDir, { recursive: true });
    const sourcePath = join(assetsRoot, 'source.jpg');
    await writeFile(
      sourcePath,
      await sharp({
        create: {
          width: 10,
          height: 10,
          channels: 3,
          background: { r: 12, g: 24, b: 36 },
        },
      })
        .jpeg()
        .toBuffer(),
    );

    const manifest = approvedManifest();
    const definition = manifest.media[0]!;
    const expectedName = expectedMediaOriginalName(definition);
    const input = planInput(manifest, {
      options: fixtureOptions({ operationId }),
    });
    input.assets[definition.key] = await inspectAsset(
      assetsRoot,
      sourcePath.slice(assetsRoot.length + 1),
    );
    const plan = buildDemoSeedPlan(input);
    const intent = buildDemoSeedIntent({
      operationId,
      identity: input.identity,
      manifest,
      assets: computeAssetsIntent(input),
      plan,
      input,
      options: input.options,
    });
    const guardrails = new PrismaDemoSeedGuardrails(prismaA, 1_000_000);
    const lock = await guardrails.acquireLock(operationId);
    const previousStorageDir = process.env.PRODUCT_MEDIA_STORAGE_DIR;
    const previousTempDir = process.env.PRODUCT_MEDIA_TEMP_DIR;
    process.env.PRODUCT_MEDIA_STORAGE_DIR = storageRoot;
    process.env.PRODUCT_MEDIA_TEMP_DIR = tempDir;
    try {
      const writer = createPrismaDemoSeedWriteGateway({
        prisma: prismaA as never,
        fence: lock,
        plan,
        planInput: input,
        intent,
        backup: {
          path: '/tmp/integration-backup.json',
          checksum: 'a'.repeat(64),
          sizeBytes: 10,
        },
      });
      const first = await writer.uploadOrReuseMedia(definition.key);
      mediaIds.push(first.id);
      expect(first.storageKey).toContain('merchandising/demo/');
      expect(first.thumbnailKey).not.toBeNull();
      const firstRow = await prismaA.merchMedia.findFirstOrThrow({
        where: { originalName: expectedName },
      });
      expect(firstRow.thumbnailKey).toBe(first.thumbnailKey);
      expect(firstRow.sourceSha256).toBe(input.assets[definition.key]!.sha256);
      expect(firstRow.processedSha256).not.toBeNull();
      expect(firstRow.thumbnailSha256).not.toBeNull();

      await prismaA.merchMedia.delete({ where: { id: first.id } });
      const recovered = await writer.uploadOrReuseMedia(definition.key);
      mediaIds.push(recovered.id);
      expect(recovered.storageAction).toBe('reused-verified-orphan');
      expect(recovered.thumbnailKey).toBe(first.thumbnailKey);
      const recoveredRow = await prismaA.merchMedia.findFirstOrThrow({
        where: { originalName: expectedName },
      });
      expect(recoveredRow.thumbnailKey).toBe(first.thumbnailKey);

      const storage = new LocalDiskMediaStorage(storageRoot);
      await storage.put(first.storageKey, Buffer.from('tampered-main-bytes'));
      await expect(
        writer.uploadOrReuseMedia(definition.key),
      ).rejects.toBeInstanceOf(MediaStorageConflictError);
    } finally {
      if (previousStorageDir === undefined) {
        delete process.env.PRODUCT_MEDIA_STORAGE_DIR;
      } else {
        process.env.PRODUCT_MEDIA_STORAGE_DIR = previousStorageDir;
      }
      if (previousTempDir === undefined) {
        delete process.env.PRODUCT_MEDIA_TEMP_DIR;
      } else {
        process.env.PRODUCT_MEDIA_TEMP_DIR = previousTempDir;
      }
      await lock.release();
      await prismaA.merchMedia.deleteMany({
        where: { originalName: expectedName },
      });
      await rm(assetsRoot, { recursive: true, force: true });
      await rm(storageRoot, { recursive: true, force: true });
    }
  });

  it('locks and validates blog rows in the final boundary and rolls activation back', async () => {
    const manifest = approvedManifest();
    const definition = manifest.blog[0]!;
    const coverMediaId = 'it-cover-media';
    const base = 'https://shop.example.com/api/v1';
    const coverImageUrl = `${base}/catalog/merch-media/${coverMediaId}`;
    await prismaA.blogPost.deleteMany({ where: { slug: definition.slug } });
    const row = await prismaA.blogPost.create({
      data: {
        slug: definition.slug,
        title: definition.title,
        excerpt: definition.excerpt,
        content: sanitizeRichText(definition.content),
        coverImageUrl,
        authorName: definition.authorName,
        status: 'DRAFT',
        createdBy: 'homepage-demo-seed',
      },
    });
    try {
      const context = {
        manifest,
        blogIds: { [definition.key]: row.id },
        mediaIds: { [definition.coverAssetKey!]: coverMediaId },
        publicApiBaseUrl: base,
      };
      await expect(
        prismaA.$transaction(async (tx) => {
          const rows = await lockAndValidateFinalBlogRows(tx, context);
          const activated = await activateFinalBlogRows(
            tx,
            {
              manifest,
              blogIds: context.blogIds,
            },
            rows,
            new Date(),
          );
          expect(activated).toContain(row.id);
          const inside = await tx.blogPost.findUniqueOrThrow({
            where: { id: row.id },
          });
          expect(inside.status).toBe('PUBLISHED');
          throw new RollbackAfterCheck('blog-rollback');
        }),
      ).rejects.toBeInstanceOf(RollbackAfterCheck);

      const after = await prismaA.blogPost.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(after.status).toBe('DRAFT');
      expect(after.updatedBy).toBeNull();

      await prismaA.blogPost.update({
        where: { id: row.id },
        data: { metaTitle: 'operator metadata' },
      });
      await expect(
        prismaA.$transaction((tx) =>
          lockAndValidateFinalBlogRows(tx, context),
        ),
      ).rejects.toThrow(/changed after planning/);

      await prismaA.blogPost.update({
        where: { id: row.id },
        data: { updatedBy: 'operator' },
      });
      await expect(
        prismaA.$transaction((tx) =>
          lockAndValidateFinalBlogRows(tx, context),
        ),
      ).rejects.toThrow(/not safely demo-owned/);
    } finally {
      await prismaA.blogPost.deleteMany({ where: { id: row.id } });
    }
  });

  // Authored for the guarded PostgreSQL suite; not executed during this
  // remediation task. It seeds a minimal disposable catalog and exercises the
  // real write gateway end to end, including fresh campaigns/blog slugs,
  // activation-before-snapshot, publication completion and completed replay.
  it('restores exact pre-existing draft, publication and media metadata after simulated mutations', async () => {
    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const draftUpdatedAt = new Date('2026-01-02T03:04:05.000Z');
    const publicationUpdatedAt = new Date('2026-02-03T04:05:06.000Z');
    const mediaUpdatedAt = new Date('2026-03-04T05:06:07.000Z');
    const publishedAt = new Date('2026-01-01T00:00:00.000Z');
    const max = await prismaA.homepagePublication.aggregate({
      _max: { version: true },
    });
    const version = (max._max.version ?? 0) + 1;
    const publication = await prismaA.homepagePublication.create({
      data: {
        version,
        status: 'SUPERSEDED',
        sections: { schemaVersion: 1, sections: [] } as never,
        schemaVersion: 1,
        sourceDraftRevision: 9,
        publishedAt,
        note: `cleanup-fixture-${stamp}`,
        createdBy: 'operator',
        publishedBy: 'operator',
      },
    });
    const mediaId = randomUUID();
    await prismaA.merchMedia.create({
      data: {
        id: mediaId,
        originalName: `cleanup-fixture-${stamp}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        storageKey: `merchandising/integration/cleanup-fixture-${stamp}.jpg`,
        createdBy: 'operator',
        publishedAt,
        updatedBy: 'operator',
      },
    });
    await prismaA.homepageDraft.create({
      data: {
        id: MERCH_HOMEPAGE_DRAFT_ID,
        revision: 9,
        schemaVersion: 1,
        sections: [] as never,
        createdBy: 'operator',
        updatedBy: 'operator',
      },
    });
    await prismaA.$executeRaw`
      UPDATE "HomepageDraft"
      SET "updatedAt" = ${draftUpdatedAt}
      WHERE "id" = ${MERCH_HOMEPAGE_DRAFT_ID}
    `;
    await prismaA.$executeRaw`
      UPDATE "HomepagePublication"
      SET "updatedAt" = ${publicationUpdatedAt}
      WHERE "id" = ${publication.id}
    `;
    await prismaA.$executeRaw`
      UPDATE "MerchMedia"
      SET "updatedAt" = ${mediaUpdatedAt}
      WHERE "id" = ${mediaId}
    `;

    const priorDraft = await prismaA.homepageDraft.findUniqueOrThrow({
      where: { id: MERCH_HOMEPAGE_DRAFT_ID },
    });
    const priorPublication =
      await prismaA.homepagePublication.findUniqueOrThrow({
        where: { id: publication.id },
        select: { id: true, status: true, updatedAt: true },
      });
    const priorMedia = await prismaA.merchMedia.findMany({
      where: { id: mediaId },
      select: {
        id: true,
        publishedAt: true,
        updatedBy: true,
        updatedAt: true,
      },
    });

    try {
      await prismaA.homepageDraft.update({
        where: { id: MERCH_HOMEPAGE_DRAFT_ID },
        data: {
          revision: 10,
          sections: [{ key: 'changed', type: 'TRUST_STRIP', order: 0 }] as never,
          updatedBy: 'demo-seed',
        },
      });
      await prismaA.homepagePublication.update({
        where: { id: publication.id },
        data: { status: 'CANCELLED' } as never,
      });
      await prismaA.merchMedia.update({
        where: { id: mediaId },
        data: { publishedAt: null, updatedBy: 'demo-seed' },
      });

      await restoreHomepageDraft(
        (strings, ...values) => prismaA.$executeRaw(strings, ...values),
        priorDraft,
      );
      await restoreHomepagePublicationStatus(
        (strings, ...values) => prismaA.$executeRaw(strings, ...values),
        priorPublication,
      );
      await restoreMerchMediaMetadata(
        (strings, ...values) => prismaA.$executeRaw(strings, ...values),
        priorMedia[0]!,
      );

      await assertHomepageDraftRestored(
        prismaA,
        priorDraft,
        MERCH_HOMEPAGE_DRAFT_ID,
      );
      await assertHomepagePublicationStatusRestored(prismaA, [
        priorPublication,
      ]);
      await assertMerchMediaMetadataRestored(prismaA, priorMedia);
    } finally {
      await prismaA.merchMedia.deleteMany({ where: { id: mediaId } });
      await prismaA.homepagePublication.deleteMany({
        where: { id: publication.id },
      });
      await prismaA.homepageDraft.deleteMany({
        where: { id: MERCH_HOMEPAGE_DRAFT_ID },
      });
    }
  });

  it('runs a fresh apply through the real Prisma write gateway and replays it', async () => {
    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const operationId = `it-real-gateway-${stamp}`;
    operationIds.push(operationId);

    const assetsRoot = await mkdtemp(
      join(tmpdir(), 'demo-seed-real-gateway-assets-'),
    );
    const storageRoot = await mkdtemp(
      join(tmpdir(), 'demo-seed-real-gateway-storage-'),
    );
    const backupRoot = await mkdtemp(
      join(tmpdir(), 'demo-seed-real-gateway-backups-'),
    );
    const previousStorageDir = process.env.PRODUCT_MEDIA_STORAGE_DIR;
    const previousTempDir = process.env.PRODUCT_MEDIA_TEMP_DIR;

    const categoryIds: string[] = [];
    const brandIds: string[] = [];
    const productIds: string[] = [];
    const variantIds: string[] = [];
    const warehouseIds: string[] = [];
    let manifest: ReturnType<typeof approvedManifest> | null = null;
    let expectedMediaNames: string[] = [];
    let priorDraft: Awaited<
      ReturnType<typeof prismaA.homepageDraft.findUnique>
    > = null;
    let priorPublications: HomepagePublicationStatusSnapshot[] = [];
    let priorPublishedMedia: MerchMediaMetadataSnapshot[] = [];
    let priorStateCaptured = false;
    let primaryError: unknown = null;

    try {
      priorDraft = await prismaA.homepageDraft.findUnique({
        where: { id: MERCH_HOMEPAGE_DRAFT_ID },
      });
      priorPublications = await prismaA.homepagePublication.findMany({
        select: { id: true, status: true, updatedAt: true },
      });
      priorPublishedMedia = await prismaA.merchMedia.findMany({
        where: { publishedAt: { not: null } },
        select: {
          id: true,
          publishedAt: true,
          updatedBy: true,
          updatedAt: true,
        },
      });
      priorStateCaptured = true;

      // Force the real backup/replacement path: a pre-existing operator draft
      // must be captured, backed up, and replaced. Cleanup restores the
      // captured pre-test state (null, in a clean suite run).
      await prismaA.homepageDraft.create({
        data: {
          id: MERCH_HOMEPAGE_DRAFT_ID,
          revision: 7,
          schemaVersion: 1,
          sections: [] as never,
          createdBy: 'operator',
          updatedBy: 'operator',
        },
      });

      for (let index = 0; index < 6; index += 1) {
        const category = await prismaA.category.create({
          data: {
            name: `Integration Category ${stamp} ${index}`,
            slug: `integration-${stamp}-category-${index}`,
            sortOrder: index,
            isVisible: true,
          },
        });
        categoryIds.push(category.id);
      }
      for (let index = 0; index < 4; index += 1) {
        const brand = await prismaA.brand.create({
          data: {
            name: `Integration Brand ${stamp} ${index}`,
            slug: `integration-${stamp}-brand-${index}`,
          },
        });
        brandIds.push(brand.id);
      }
      const warehouse = await prismaA.warehouse.create({
        data: {
          code: `it-${stamp}`,
          name: `Integration Warehouse ${stamp}`,
        },
      });
      warehouseIds.push(warehouse.id);

      for (let index = 0; index < 8; index += 1) {
        const product = await prismaA.product.create({
          data: {
            name: `Integration Product ${stamp} ${index}`,
            slug: `integration-${stamp}-product-${index}`,
            categoryId: categoryIds[index % categoryIds.length]!,
            brandId: brandIds[index % brandIds.length]!,
            condition: ProductCondition.NEW,
            status: ProductStatus.PUBLISHED,
          },
        });
        productIds.push(product.id);
        const variant = await prismaA.productVariant.create({
          data: {
            productId: product.id,
            sku: `IT-${stamp}-${index}`,
            name: 'Default',
            price: new Prisma.Decimal('1000000'),
            priceStatus: 'PRICED',
          },
        });
        variantIds.push(variant.id);
        await prismaA.inventoryItem.create({
          data: {
            warehouseId: warehouse.id,
            variantId: variant.id,
            quantityOnHand: 10,
            quantityReserved: 0,
          },
        });
      }

      manifest = approvedManifest();
      const seededProductSlugs = Array.from(
        { length: 8 },
        (_value, index) => `integration-${stamp}-product-${index}`,
      );
      manifest.campaigns = manifest.campaigns.map((campaign) => ({
        ...campaign,
        internalName: `${campaign.internalName}-${stamp}`,
        ...(campaign.selection.products?.kind === 'explicit'
          ? {
              selection: {
                ...campaign.selection,
                products: {
                  kind: 'explicit' as const,
                  slugs: seededProductSlugs.slice(0, 3),
                },
              },
            }
          : {}),
      }));
      manifest.media = manifest.media.map((asset, index) => ({
        ...asset,
        fileName: `${stamp}-${index}-${asset.fileName}`,
      }));
      manifest.blog = manifest.blog.map((article) => ({
        ...article,
        slug: `${article.slug}-${stamp}`,
      }));
      expectedMediaNames = manifest.media.map(expectedMediaOriginalName);

      await mkdir(assetsRoot, { recursive: true });
      for (const [index, asset] of manifest.media.entries()) {
        const bytes = await sharp({
          create: {
            width: 20 + index,
            height: 20 + index,
            channels: 3,
            background: {
              r: 20 + index * 10,
              g: 40 + index * 5,
              b: 60 + index * 3,
            },
          },
        })
          .jpeg()
          .toBuffer();
        await writeFile(join(assetsRoot, asset.fileName), bytes);
      }

      process.env.PRODUCT_MEDIA_STORAGE_DIR = storageRoot;
      process.env.PRODUCT_MEDIA_TEMP_DIR = join(storageRoot, 'tmp');

      const identity = await runReadOnlyTransaction(prismaA, (tx) =>
        readDatabaseIdentity(tx),
      );
      const demoOptions = fixtureOptions({
        operationId,
        expectedFingerprint: identity.fingerprint,
        assetsDir: assetsRoot,
        backupDir: backupRoot,
        mediaReconciliationAckIds: [],
      });
      const loader = new PrismaDemoSeedPlanLoader(prismaA);
      let planInputValue = await loader.load(demoOptions, manifest);
      let plan = buildDemoSeedPlan(planInputValue);
      if (plan.mediaReconciliation.affected.length > 0) {
        demoOptions.mediaReconciliationAckIds =
          plan.mediaReconciliation.affected.map((row) => row.id);
        planInputValue = await loader.load(demoOptions, manifest);
        plan = buildDemoSeedPlan(planInputValue);
      }
      expect(plan.applyPermitted).toBe(true);
      expect(plan.draft).toMatchObject({
        action: 'replace',
        sourceRevision: 7,
        requiresBackup: true,
      });

      const service = new DemoSeedService(
        loader,
        (input) =>
          createPrismaDemoSeedWriteGateway({
            prisma: prismaA as never,
            ...input,
          }),
        new PrismaDemoSeedGuardrails(prismaA, 1_000_000),
      );

      const first = await service.apply(demoOptions, manifest);
      expect(first.replayed).toBe(false);
      expect(first.draft.publicationId).not.toBeNull();
      expect(first.draft.publicationVersion).not.toBeNull();
      expect(first.blog['demo-article-1']).toBeTruthy();
      if (first.backup === null) {
        throw new Error('Expected a real draft backup before replacement.');
      }
      expect(first.backup.path.startsWith(backupRoot)).toBe(true);
      const backupStat = await stat(first.backup.path);
      expect(backupStat.mode & 0o777).toBe(0o600);
      expect(backupStat.size).toBe(first.backup.sizeBytes);
      const backupPayload = JSON.parse(
        await readFile(first.backup.path, 'utf8'),
      ) as {
        checksum: string;
        payload: { draft: { revision: number; sections: unknown[] } };
      };
      expect(backupPayload.checksum).toBe(first.backup.checksum);
      expect(backupPayload.payload.draft.revision).toBe(7);
      expect(backupPayload.payload.draft.sections).toEqual([]);

      const updatedDraft = await prismaA.homepageDraft.findUniqueOrThrow({
        where: { id: MERCH_HOMEPAGE_DRAFT_ID },
      });
      expect(updatedDraft.revision).toBe(8);
      expect(updatedDraft.sections).toEqual(expect.any(Array));
      expect((updatedDraft.sections as unknown[]).length).toBe(9);
      expect(updatedDraft.createdBy).toBe('operator');
      expect(updatedDraft.updatedBy).toBe('homepage-demo-seed');

      const createdCampaign = await prismaA.merchCampaign.findFirstOrThrow({
        where: { internalName: manifest.campaigns[0]!.internalName },
      });
      expect(createdCampaign.internalName).toBe(
        manifest.campaigns[0]!.internalName,
      );
      expect(createdCampaign.titleFa).toBe(
        manifest.campaigns[0]!.copy.titleFa,
      );

      const createdBlog = await prismaA.blogPost.findUniqueOrThrow({
        where: { slug: manifest.blog[0]!.slug },
      });
      expect(createdBlog.status).toBe('PUBLISHED');
      expect(createdBlog.slug).toBe(manifest.blog[0]!.slug);

      const createdMedia = await prismaA.merchMedia.findMany({
        where: { originalName: { in: expectedMediaNames } },
      });
      expect(createdMedia).toHaveLength(manifest.media.length);
      expect(
        createdMedia.every(
          (row) =>
            row.thumbnailKey !== null &&
            row.sourceSha256 !== null &&
            row.processedSha256 !== null &&
            row.thumbnailSha256 !== null &&
            row.publishedAt !== null,
        ),
      ).toBe(true);

      const publication =
        await prismaA.homepagePublication.findUniqueOrThrow({
          where: { demoSeedOperationId: operationId },
        });
      expect(publication.status).toBe('PUBLISHED');
      expect(publication.sourceDraftRevision).toBe(first.draft.revision);
      expect(publication.sourceDraftRevision).toBe(8);

      const journal =
        await prismaA.homepageDemoSeedOperation.findUniqueOrThrow({
          where: { id: operationId },
        });
      expect(journal.state).toBe('COMPLETED');
      expect(journal.publicationId).toBe(publication.id);
      expect(journal.result).not.toBeNull();
      expect(journal.backupPath).toBe(first.backup.path);
      expect(journal.backupChecksum).toBe(first.backup.checksum);
      expect(journal.backupRevision).toBe(7);

      const replay = await service.apply(demoOptions, manifest);
      expect(replay.replayed).toBe(true);
      expect(replay.draft.publicationId).toBe(publication.id);
      expect(replay.backup).toEqual(first.backup);
      expect(
        await prismaA.homepagePublication.count({
          where: { demoSeedOperationId: operationId },
        }),
      ).toBe(1);
    } catch (error) {
      primaryError = error;
    }

    // Best-effort cleanup: every independent action is attempted even if an
    // earlier one fails. The primary test failure is preserved and cleanup
    // failures are attached to it; a passed test with cleanup failures fails
    // with a CleanupError.
    const cleanupActions: CleanupAction[] = [
      {
        name: 'restore media environment',
        run: () => {
          if (previousStorageDir === undefined) {
            delete process.env.PRODUCT_MEDIA_STORAGE_DIR;
          } else {
            process.env.PRODUCT_MEDIA_STORAGE_DIR = previousStorageDir;
          }
          if (previousTempDir === undefined) {
            delete process.env.PRODUCT_MEDIA_TEMP_DIR;
          } else {
            process.env.PRODUCT_MEDIA_TEMP_DIR = previousTempDir;
          }
        },
      },
      {
        name: 'delete demo journal',
        resource: operationId,
        run: async () => {
          await prismaA.homepageDemoSeedOperation.deleteMany({
            where: { id: operationId },
          });
        },
      },
      {
        name: 'delete demo publication',
        resource: operationId,
        run: async () => {
          await prismaA.homepagePublication.deleteMany({
            where: { demoSeedOperationId: operationId },
          });
        },
      },
    ];

    if (manifest !== null) {
      cleanupActions.push(
        {
          name: 'delete demo blog posts',
          resource: manifest.blog.map((article) => article.slug).join(','),
          run: async () => {
            await prismaA.blogPost.deleteMany({
              where: {
                slug: { in: manifest!.blog.map((article) => article.slug) },
              },
            });
          },
        },
        {
          name: 'delete demo campaigns',
          resource: manifest.campaigns
            .map((campaign) => campaign.internalName)
            .join(','),
          run: async () => {
            await prismaA.merchCampaign.deleteMany({
              where: {
                internalName: {
                  in: manifest!.campaigns.map(
                    (campaign) => campaign.internalName,
                  ),
                },
              },
            });
          },
        },
      );
    }

    cleanupActions.push(
      {
        name: 'delete demo media',
        resource: expectedMediaNames.join(','),
        run: async () => {
          await prismaA.merchMedia.deleteMany({
            where: { originalName: { in: expectedMediaNames } },
          });
        },
      },
      {
        name: 'delete demo inventory',
        resource: variantIds.join(','),
        run: async () => {
          await prismaA.inventoryItem.deleteMany({
            where: { variantId: { in: variantIds } },
          });
        },
      },
      {
        name: 'delete demo variants',
        resource: variantIds.join(','),
        run: async () => {
          await prismaA.productVariant.deleteMany({
            where: { id: { in: variantIds } },
          });
        },
      },
      {
        name: 'delete demo products',
        resource: productIds.join(','),
        run: async () => {
          await prismaA.product.deleteMany({
            where: { id: { in: productIds } },
          });
        },
      },
      {
        name: 'delete demo brands',
        resource: brandIds.join(','),
        run: async () => {
          await prismaA.brand.deleteMany({
            where: { id: { in: brandIds } },
          });
        },
      },
      {
        name: 'delete demo categories',
        resource: categoryIds.join(','),
        run: async () => {
          await prismaA.category.deleteMany({
            where: { id: { in: categoryIds } },
          });
        },
      },
      {
        name: 'delete demo warehouse',
        resource: warehouseIds.join(','),
        run: async () => {
          await prismaA.warehouse.deleteMany({
            where: { id: { in: warehouseIds } },
          });
        },
      },
    );

    if (priorStateCaptured) {
      for (const row of priorPublishedMedia) {
        cleanupActions.push({
          name: 'restore pre-existing media metadata',
          resource: row.id,
          run: async () => {
            await restoreMerchMediaMetadata(
              (strings, ...values) => prismaA.$executeRaw(strings, ...values),
              row,
            );
          },
        });
      }
      cleanupActions.push({
        name: 'verify pre-existing media metadata restoration',
        resource: `${priorPublishedMedia.length} rows`,
        run: async () => {
          await assertMerchMediaMetadataRestored(
            prismaA,
            priorPublishedMedia,
          );
        },
      });
      for (const row of priorPublications) {
        cleanupActions.push({
          name: 'restore pre-existing publication status',
          resource: row.id,
          run: async () => {
            await restoreHomepagePublicationStatus(
              (strings, ...values) => prismaA.$executeRaw(strings, ...values),
              row,
            );
          },
        });
      }
      cleanupActions.push({
        name: 'verify pre-existing publication restoration',
        resource: `${priorPublications.length} rows`,
        run: async () => {
          await assertHomepagePublicationStatusRestored(
            prismaA,
            priorPublications,
          );
        },
      });
      cleanupActions.push({
        name: 'restore pre-existing homepage draft',
        resource: MERCH_HOMEPAGE_DRAFT_ID,
        run: async () => {
          if (priorDraft === null) {
            await prismaA.homepageDraft.deleteMany({
              where: { id: MERCH_HOMEPAGE_DRAFT_ID },
            });
          } else {
            await restoreHomepageDraft(
              (strings, ...values) => prismaA.$executeRaw(strings, ...values),
              priorDraft,
            );
          }
        },
      });
      cleanupActions.push({
        name: 'verify pre-existing homepage draft restoration',
        resource: MERCH_HOMEPAGE_DRAFT_ID,
        run: async () => {
          await assertHomepageDraftRestored(
            prismaA,
            priorDraft,
            MERCH_HOMEPAGE_DRAFT_ID,
          );
        },
      });
    }

    cleanupActions.push(
      {
        name: 'remove temporary assets directory',
        resource: assetsRoot,
        run: async () => {
          await rm(assetsRoot, { recursive: true, force: true });
        },
      },
      {
        name: 'remove temporary storage directory',
        resource: storageRoot,
        run: async () => {
          await rm(storageRoot, { recursive: true, force: true });
        },
      },
      {
        name: 'remove temporary backup directory',
        resource: backupRoot,
        run: async () => {
          await rm(backupRoot, { recursive: true, force: true });
        },
      },
    );

    const cleanupFailures = await runCleanupActions(cleanupActions);
    finalizeCleanup(primaryError, cleanupFailures);
  });

  it('serves published media and thumbnails and hides unpublished, deleted or missing binaries', async () => {
    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const root = await mkdtemp(join(tmpdir(), 'demo-seed-public-media-'));
    const storage = new LocalDiskMediaStorage(root);
    const service = new MerchMediaService(
      prismaA as never,
      {} as never,
      storage,
      {} as never,
      join(root, 'tmp'),
    );
    const controller = new PublicMerchMediaController(service);
    const response = { setHeader: () => undefined } as never;
    const publishedId = randomUUID();
    const unpublishedId = randomUUID();
    const deletedId = randomUUID();
    const missingBinaryId = randomUUID();
    const main = 'published-main-bytes';
    const thumbnail = 'published-thumbnail-bytes';
    const mainKey = `merchandising/integration/${publishedId}.jpg`;
    const thumbnailKey = `merchandising/integration/${publishedId}.thumb.webp`;
    const unpublishedMainKey = `merchandising/integration/${unpublishedId}.jpg`;
    const deletedMainKey = `merchandising/integration/${deletedId}.jpg`;
    const missingKey = `merchandising/integration/${missingBinaryId}.jpg`;
    const mediaIds = [
      publishedId,
      unpublishedId,
      deletedId,
      missingBinaryId,
    ];

    try {
      await storage.put(mainKey, Buffer.from(main));
      await storage.put(thumbnailKey, Buffer.from(thumbnail));
      await storage.put(unpublishedMainKey, Buffer.from('unpublished'));
      await storage.put(deletedMainKey, Buffer.from('deleted'));
      await prismaA.merchMedia.createMany({
        data: [
          {
            id: publishedId,
            originalName: `published-${stamp}.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: Buffer.byteLength(main),
            storageKey: mainKey,
            thumbnailKey,
            createdBy: 'operator',
            publishedAt: new Date(),
          },
          {
            id: unpublishedId,
            originalName: `unpublished-${stamp}.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: 11,
            storageKey: unpublishedMainKey,
            createdBy: 'operator',
          },
          {
            id: deletedId,
            originalName: `deleted-${stamp}.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: 7,
            storageKey: deletedMainKey,
            createdBy: 'operator',
            publishedAt: new Date(),
            deletedAt: new Date(),
          },
          {
            id: missingBinaryId,
            originalName: `missing-${stamp}.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: 9,
            storageKey: missingKey,
            createdBy: 'operator',
            publishedAt: new Date(),
          },
        ],
      });

      const published = await service.getPublicStream(publishedId);
      expect(published.mimeType).toBe('image/jpeg');
      expect(published.sizeBytes).toBe(Buffer.byteLength(main));
      expect(await collectStream(published.stream)).toEqual(Buffer.from(main));

      const publishedThumb = await service.getPublicThumbnail(publishedId);
      expect(await collectStream(publishedThumb.stream)).toEqual(
        Buffer.from(thumbnail),
      );

      const controllerFile = await controller.file(publishedId, response);
      expect(controllerFile).toBeInstanceOf(StreamableFile);
      expect(await collectStream(controllerFile.getStream())).toEqual(
        Buffer.from(main),
      );
      const controllerThumb = await controller.thumbnail(
        publishedId,
        response,
      );
      expect(controllerThumb).toBeInstanceOf(StreamableFile);
      expect(await collectStream(controllerThumb.getStream())).toEqual(
        Buffer.from(thumbnail),
      );

      for (const id of [unpublishedId, deletedId, missingBinaryId]) {
        await expect(service.getPublicStream(id)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        await expect(service.getPublicThumbnail(id)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        await expect(controller.file(id, response)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        await expect(
          controller.thumbnail(id, response),
        ).rejects.toBeInstanceOf(NotFoundException);
      }
    } finally {
      await prismaA.merchMedia.deleteMany({
        where: { id: { in: mediaIds } },
      });
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rolls back a real-gateway publication failure and resumes the journaled operation', async () => {
    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const operationId = `it-publication-failure-${stamp}`;
    const operationIds = [operationId];
    const { scenario, cleanupActions } = await createRealGatewayFixture(
      prismaA,
      stamp,
      operationIds,
    );
    cleanupActions.push({
      name: 'drop publication failure trigger',
      resource: operationId,
      run: async () => {
        await dropPublicationFailureTrigger(prismaA, operationId);
      },
    });
    let primaryError: unknown = null;

    try {
      await prismaA.homepageDraft.create({
        data: {
          id: MERCH_HOMEPAGE_DRAFT_ID,
          revision: 5,
          schemaVersion: 1,
          sections: [] as never,
          createdBy: 'operator',
          updatedBy: 'operator',
        },
      });
      await installPublicationFailureTrigger(prismaA, operationId);
      const { options, loader } = await loadRealGatewayPlan(
        prismaA,
        scenario,
        operationId,
      );
      const service = realGatewayService(prismaA, loader);

      await expect(
        service.apply(options, scenario.manifest),
      ).rejects.toThrow(/forced publication failure/);

      const draftAfterFailure = await prismaA.homepageDraft.findUniqueOrThrow({
        where: { id: MERCH_HOMEPAGE_DRAFT_ID },
      });
      expect(draftAfterFailure.revision).toBe(5);
      expect(draftAfterFailure.sections).toEqual([]);

      const blogsAfterFailure = await prismaA.blogPost.findMany({
        where: {
          slug: { in: scenario.manifest.blog.map((article) => article.slug) },
        },
      });
      expect(blogsAfterFailure).toHaveLength(scenario.manifest.blog.length);
      expect(blogsAfterFailure.every((row) => row.status === 'DRAFT')).toBe(
        true,
      );
      expect(
        await prismaA.homepagePublication.count({
          where: { demoSeedOperationId: operationId },
        }),
      ).toBe(0);

      const failedJournal =
        await prismaA.homepageDemoSeedOperation.findUniqueOrThrow({
          where: { id: operationId },
        });
      expect(failedJournal.state).toBe('FAILED');
      expect(failedJournal.failureReason).toContain('forced publication failure');
      expect(failedJournal.backupPath).not.toBeNull();
      expect(failedJournal.backupRevision).toBe(5);
      // Campaign/media/blog writes are intentionally journaled outside the
      // final transaction; a retry must reuse them rather than duplicate them.
      expect(
        await prismaA.merchCampaign.count({
          where: {
            internalName: {
              in: scenario.manifest.campaigns.map(
                (campaign) => campaign.internalName,
              ),
            },
          },
        }),
      ).toBe(scenario.manifest.campaigns.length);
      expect(
        await prismaA.merchMedia.count({
          where: { originalName: { in: scenario.expectedMediaNames } },
        }),
      ).toBe(scenario.manifest.media.length);

      await dropPublicationFailureTrigger(prismaA, operationId);

      const retry = await service.apply(options, scenario.manifest);
      expect(retry.replayed).toBe(false);
      expect(retry.draft.publicationId).not.toBeNull();
      expect(retry.draft.revision).toBe(6);
      const publication =
        await prismaA.homepagePublication.findUniqueOrThrow({
          where: { demoSeedOperationId: operationId },
        });
      expect(publication.status).toBe('PUBLISHED');
      expect(publication.sourceDraftRevision).toBe(6);
      const retriedJournal =
        await prismaA.homepageDemoSeedOperation.findUniqueOrThrow({
          where: { id: operationId },
        });
      expect(retriedJournal.state).toBe('COMPLETED');
      expect(retriedJournal.publicationId).toBe(publication.id);
      const replay = await service.apply(options, scenario.manifest);
      expect(replay.replayed).toBe(true);
      expect(replay.draft.publicationId).toBe(publication.id);
    } catch (error) {
      primaryError = error;
    } finally {
      const cleanupFailures = await runCleanupActions(cleanupActions);
      finalizeCleanup(primaryError, cleanupFailures);
    }
  });

  it('cleans up a real-gateway partial apply without touching unrelated rows', async () => {
    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const operationId = `it-partial-cleanup-${stamp}`;
    const operationIds = [operationId];
    const { scenario, cleanupActions } = await createRealGatewayFixture(
      prismaA,
      stamp,
      operationIds,
    );
    cleanupActions.push({
      name: 'drop publication failure trigger',
      resource: operationId,
      run: async () => {
        await dropPublicationFailureTrigger(prismaA, operationId);
      },
    });
    const sentinel = await prismaA.category.create({
      data: {
        name: `Unrelated Sentinel ${stamp}`,
        slug: `unrelated-sentinel-${stamp}`,
        isVisible: false,
      },
    });
    let primaryError: unknown = null;
    let cleanupRan = false;

    try {
      await prismaA.homepageDraft.create({
        data: {
          id: MERCH_HOMEPAGE_DRAFT_ID,
          revision: 3,
          schemaVersion: 1,
          sections: [] as never,
          createdBy: 'operator',
          updatedBy: 'operator',
        },
      });
      await installPublicationFailureTrigger(prismaA, operationId);
      const { options, loader } = await loadRealGatewayPlan(
        prismaA,
        scenario,
        operationId,
      );
      const service = realGatewayService(prismaA, loader);
      await expect(
        service.apply(options, scenario.manifest),
      ).rejects.toThrow(/forced publication failure/);

      expect(
        await prismaA.homepageDemoSeedOperation.count({
          where: { id: operationId, state: 'FAILED' },
        }),
      ).toBe(1);
      expect(
        await prismaA.merchCampaign.count({
          where: {
            internalName: {
              in: scenario.manifest.campaigns.map(
                (campaign) => campaign.internalName,
              ),
            },
          },
        }),
      ).toBeGreaterThan(0);
      expect(
        await prismaA.merchMedia.count({
          where: { originalName: { in: scenario.expectedMediaNames } },
        }),
      ).toBeGreaterThan(0);

      const cleanupFailures = await runCleanupActions(cleanupActions);
      cleanupRan = true;
      expect(cleanupFailures).toEqual([]);

      expect(
        await prismaA.homepageDemoSeedOperation.count({
          where: { id: operationId },
        }),
      ).toBe(0);
      expect(
        await prismaA.homepagePublication.count({
          where: { demoSeedOperationId: operationId },
        }),
      ).toBe(0);
      expect(
        await prismaA.homepageDraft.count({
          where: { id: MERCH_HOMEPAGE_DRAFT_ID },
        }),
      ).toBe(0);
      expect(
        await prismaA.merchCampaign.count({
          where: {
            internalName: {
              in: scenario.manifest.campaigns.map(
                (campaign) => campaign.internalName,
              ),
            },
          },
        }),
      ).toBe(0);
      expect(
        await prismaA.merchMedia.count({
          where: { originalName: { in: scenario.expectedMediaNames } },
        }),
      ).toBe(0);
      expect(
        await prismaA.blogPost.count({
          where: {
            slug: { in: scenario.manifest.blog.map((article) => article.slug) },
          },
        }),
      ).toBe(0);
      expect(
        await prismaA.category.count({ where: { id: { in: scenario.categoryIds } } }),
      ).toBe(0);
      expect(
        await prismaA.brand.count({ where: { id: { in: scenario.brandIds } } }),
      ).toBe(0);
      expect(
        await prismaA.product.count({
          where: { id: { in: scenario.productIds } },
        }),
      ).toBe(0);
      expect(
        await prismaA.warehouse.count({
          where: { id: { in: scenario.warehouseIds } },
        }),
      ).toBe(0);
      expect(
        await prismaA.category.findUnique({ where: { id: sentinel.id } }),
      ).not.toBeNull();
      await expect(
        stat(scenario.assetsRoot).then(
          () => true,
          () => false,
        ),
      ).resolves.toBe(false);
      await expect(
        stat(scenario.storageRoot).then(
          () => true,
          () => false,
        ),
      ).resolves.toBe(false);
      await expect(
        stat(scenario.backupRoot).then(
          () => true,
          () => false,
        ),
      ).resolves.toBe(false);
    } catch (error) {
      primaryError = error;
    } finally {
      if (!cleanupRan) {
        const cleanupFailures = await runCleanupActions(cleanupActions);
        if (primaryError === null && cleanupFailures.length > 0) {
          primaryError = new Error(
            `Partial-apply cleanup failed: ${JSON.stringify(cleanupFailures)}`,
          );
        }
      }
      await prismaA.category
        .deleteMany({ where: { id: sentinel.id } })
        .catch(() => undefined);
    }
    if (primaryError !== null) throw primaryError;
  });

  it('serializes two real full applies and leaves exactly one consistent winner', async () => {
    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const operationA = `it-concurrent-a-${stamp}`;
    const operationB = `it-concurrent-b-${stamp}`;
    const operationIds = [operationA, operationB];
    const { scenario, cleanupActions } = await createRealGatewayFixture(
      prismaA,
      stamp,
      operationIds,
    );
    let primaryError: unknown = null;

    try {
      const loadedA = await loadRealGatewayPlan(
        prismaA,
        scenario,
        operationA,
      );
      const loadedB = await loadRealGatewayPlan(
        prismaB,
        scenario,
        operationB,
      );
      const serviceA = realGatewayService(prismaA, loadedA.loader);
      const serviceB = realGatewayService(prismaB, loadedB.loader);
      const startedAt = Date.now();
      const results = await Promise.allSettled([
        serviceA.apply(loadedA.options, scenario.manifest),
        serviceB.apply(loadedB.options, scenario.manifest),
      ]);
      expect(Date.now() - startedAt).toBeLessThan(20_000);

      const fulfilled = results.filter(
        (result): result is PromiseFulfilledResult<Awaited<ReturnType<DemoSeedService['apply']>>> =>
          result.status === 'fulfilled',
      );
      const rejected = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toBeInstanceOf(DemoSeedLockUnavailableError);

      const winner = fulfilled[0]!.value;
      const loserOperationId =
        winner.operationId === operationA ? operationB : operationA;
      expect(
        await prismaA.homepageDemoSeedOperation.count({
          where: { id: loserOperationId },
        }),
      ).toBe(0);
      expect(
        await prismaA.homepageDemoSeedOperation.count({
          where: { id: { in: operationIds }, state: 'COMPLETED' },
        }),
      ).toBe(1);
      expect(
        await prismaA.homepagePublication.count({
          where: { demoSeedOperationId: { in: operationIds } },
        }),
      ).toBe(1);
      const winnerPublication =
        await prismaA.homepagePublication.findUniqueOrThrow({
          where: { demoSeedOperationId: winner.operationId },
        });
      expect(winnerPublication.status).toBe('PUBLISHED');
      for (const campaign of scenario.manifest.campaigns) {
        expect(
          await prismaA.merchCampaign.count({
            where: { internalName: campaign.internalName },
          }),
        ).toBe(1);
      }
      for (const mediaName of scenario.expectedMediaNames) {
        expect(
          await prismaA.merchMedia.count({
            where: { originalName: mediaName },
          }),
        ).toBe(1);
      }
      for (const article of scenario.manifest.blog) {
        expect(
          await prismaA.blogPost.count({ where: { slug: article.slug } }),
        ).toBe(1);
      }

      const winnerService =
        winner.operationId === operationA ? serviceA : serviceB;
      const winnerOptions =
        winner.operationId === operationA ? loadedA.options : loadedB.options;
      const replay = await winnerService.apply(
        winnerOptions,
        scenario.manifest,
      );
      expect(replay.replayed).toBe(true);
      expect(replay.draft.publicationId).toBe(winnerPublication.id);
    } catch (error) {
      primaryError = error;
    } finally {
      const cleanupFailures = await runCleanupActions(cleanupActions);
      finalizeCleanup(primaryError, cleanupFailures);
    }
  });

  it('enforces PostgreSQL read-only transactions', async () => {
    const id = `integration-readonly-${Date.now()}`;
    operationIds.push(id);
    await expect(
      runReadOnlyTransaction(prismaA, (tx) =>
        tx.homepageDemoSeedOperation.create({
          data: { id, state: 'SHOULD_NOT_EXIST' },
        }),
      ),
    ).rejects.toBeDefined();
  });

  it('enforces partial uniqueness for demo campaign and media markers', async () => {
    const campaignName = `homepage-demo:integration-${Date.now()}`;
    campaignNames.push(campaignName);
    await prismaA.merchCampaign.create({
      data: {
        internalName: campaignName,
        type: 'EDITORIAL',
        titleFa: 'integration',
      },
    });
    await expect(
      prismaA.merchCampaign.create({
        data: {
          internalName: campaignName,
          type: 'EDITORIAL',
          titleFa: 'integration duplicate',
        },
      }),
    ).rejects.toBeDefined();

    const originalName = `homepage-demo-integration-${Date.now()}.jpg`;
    const firstMediaId = randomUUID();
    const secondMediaId = randomUUID();
    mediaIds.push(firstMediaId, secondMediaId);
    await prismaA.merchMedia.create({
      data: {
        id: firstMediaId,
        originalName,
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        storageKey: `merchandising/integration/${firstMediaId}.jpg`,
      },
    });
    await expect(
      prismaA.merchMedia.create({
        data: {
          id: secondMediaId,
          originalName,
          mimeType: 'image/jpeg',
          sizeBytes: 1,
          storageKey: `merchandising/integration/${secondMediaId}.jpg`,
        },
      }),
    ).rejects.toBeDefined();
  });
});
