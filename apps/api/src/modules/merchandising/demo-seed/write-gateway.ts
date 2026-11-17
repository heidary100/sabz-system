import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { BlogStatus, Prisma } from '@prisma/client';
import {
  MERCH_HOMEPAGE_DRAFT_ID,
  MERCH_HOMEPAGE_SCHEMA_VERSION,
} from '@sabz/types';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { BlogService } from '../../blog/blog.service';
import { StorefrontCacheService } from '../../../common/storefront-cache/storefront-cache.service';
import {
  BLOG_POSTS_TAG,
  blogPostTag,
} from '../../../common/storefront-cache/catalog-tags';
import { sanitizeRichText } from '../../products/description-sanitize';
import { CampaignService } from '../campaigns/campaign.service';
import { HomepageDraftService } from '../homepage/homepage-draft.service';
import { HomepageSourceService } from '../homepage/homepage-source.service';
import { lockHomepagePublicationSources } from '../lifecycle-locks';
import { reconcilePublishedMediaEligibility } from '../homepage/homepage-media-eligibility';
import { collectVisibleMediaIds } from '../media/media-lifecycle';
import { MerchMediaService } from '../media/merch-media.service';
import { LocalDiskMediaStorage } from '../../products/storage/local-disk-media.storage';
import { FfmpegRunner } from '../../products/media-processing/ffmpeg.runner';
import { ImageProcessorService } from '../../products/media-processing/image-processor.service';
import { MediaProcessingService } from '../../products/media-processing/media-processing.service';
import { VideoProcessorService } from '../../products/media-processing/video-processor.service';
import { WatermarkOverlayService } from '../../products/media-processing/watermark-overlay.service';
import { resolveWatermarkConfig } from '../../products/media-processing/watermark-config';
import {
  DEMO_SEED_ACTOR_ID,
  DEMO_MEDIA_NAME_PREFIX,
} from './constants';
import {
  blogOwnership,
  campaignOwnership,
  expectedMediaOriginalName,
  mediaOwnership,
} from './ownership';
import {
  assertDraftState,
  assertMediaReconciliation,
  assertPublicationAcknowledgement,
  assertPublishedBlogUnchanged,
  assertPublishedState,
} from './guards';
import { copyVerifiedAsset } from './asset';
import {
  assertApprovedManifest,
  assertAuthorizationBindings,
  computeSectionsHash,
  hashJson,
  sameIdSet,
  sortedUnique,
  type DemoSeedWriteAuthorization,
} from './authorization';
import {
  buildHomepageSections,
  campaignPayload,
} from './planner';
import {
  buildDemoSeedBaselineIntent,
  computeAssetsIntent,
  computeManifestHash,
  computePlanHash,
  type DemoSeedIntent,
} from './intent';
import {
  completeDemoSeedOperationWithinTransaction,
} from './guardrails';
import type { DemoSeedFence } from './demo-fence';
import { readDatabaseIdentity } from './identity';
import { assertMediaAssetKey, demoMediaStorageKeys } from './media-keys';
import { MediaStorageConflictError } from '../media/idempotent-media-storage';
import { assertStoredMediaProvenance } from './media-provenance';
import {
  activateFinalBlogRows,
  lockAndValidateFinalBlogRows,
} from './blog-finalization';
import type { DraftBackupResult } from './backup';
import type {
  DemoBlogArticleDefinition,
  DemoCampaignDefinition,
  DemoDraftApplyResult,
  DemoMediaAssetDefinition,
  DemoSeedManifest,
  DemoSeedOperationResult,
  DemoSeedPlan,
  DemoSeedPlanInput,
  DemoSeedWriteGateway,
} from './types';

const ISSUED = new WeakSet<object>();

interface WriterDependencies {
  prisma: PrismaService;
  fence: DemoSeedFence;
  plan: DemoSeedPlan;
  planInput: DemoSeedPlanInput;
  intent: DemoSeedIntent;
  backup: DraftBackupResult | null;
}

interface ResolvedMediaRow {
  id: string;
  originalName: string;
  storageKey: string;
  thumbnailKey: string | null;
  sizeBytes: number;
  sourceSha256: string | null;
  processedSha256: string | null;
  thumbnailSha256: string | null;
  createdBy: string | null;
  publishedAt: Date | null;
  deletedAt: Date | null;
}

interface ResolvedRows {
  campaigns: Array<{
    id: string;
    internalName: string;
    createdBy: string | null;
    updatedBy: string | null;
    archivedAt: Date | null;
  }>;
  media: ResolvedMediaRow[];
}

function sealAuthorization(
  authorization: DemoSeedWriteAuthorization,
): DemoSeedWriteAuthorization {
  const sealed = Object.freeze(authorization);
  ISSUED.add(sealed);
  return sealed;
}

function assertSealedAuthorization(
  value: DemoSeedWriteAuthorization,
): void {
  if (!ISSUED.has(value)) {
    throw new Error(
      'Homepage demo seed write authorization is missing or invalid.',
    );
  }
}

/**
 * Creates the write composition root. The class and capability constructor are
 * module-private: the only public entry point validates the sealed intent and
 * approved manifest before returning a writer.
 */
export function createPrismaDemoSeedWriteGateway(
  dependencies: WriterDependencies,
): DemoSeedWriteGateway {
  const { manifest, identity, options } = dependencies.planInput;
  assertApprovedManifest(manifest);
  if (!dependencies.plan.applyPermitted) {
    throw new Error(
      'The write gateway cannot be created for a plan that is not apply-permitted.',
    );
  }
  if (dependencies.plan.draft.requiresBackup && dependencies.backup === null) {
    throw new Error(
      'The write gateway cannot replace a draft without a completed backup.',
    );
  }

  const manifestHash = computeManifestHash(manifest);
  const assets = computeAssetsIntent(dependencies.planInput);
  const baseline = buildDemoSeedBaselineIntent(
    dependencies.planInput,
    dependencies.plan,
  );
  const expectedPlanHash = computePlanHash({
    manifestHash,
    identityFingerprint: identity.fingerprint,
    assets,
    publicationMode: dependencies.intent.publicationMode,
    mediaAckIds: dependencies.intent.mediaAckIds,
  });
  const intent = dependencies.intent;
  if (
    intent.operationId !== options.operationId ||
    intent.baselineHash !== hashJson(baseline) ||
    hashJson(intent.baseline) !== hashJson(baseline) ||
    intent.identityFingerprint !== identity.fingerprint ||
    intent.manifestHash !== manifestHash ||
    intent.planHash !== expectedPlanHash ||
    intent.intentHash !== hashJson(intent.payload) ||
    hashJson(intent.assets) !== hashJson(assets) ||
    hashJson(intent.payload.manifest) !== manifestHash ||
    hashJson(intent.payload.assets) !== hashJson(assets) ||
    hashJson(intent.payload.identity) !== hashJson(identity) ||
    intent.payload.manifestHash !== manifestHash ||
    intent.payload.planHash !== intent.planHash ||
    intent.payload.identity.fingerprint !== identity.fingerprint ||
    intent.payload.operationId !== options.operationId ||
    intent.payload.publicationMode !== intent.publicationMode ||
    intent.payload.replaceDraft !== options.replaceDraft ||
    intent.payload.publish !== options.publish ||
    intent.payload.acknowledgePublicationReplacement !==
      options.acknowledgePublicationReplacement ||
    intent.payload.publicApiBaseUrl !== options.publicApiBaseUrl ||
    !sameIdSet(
      intent.payload.mediaReconciliationAckIds,
      intent.mediaAckIds,
    )
  ) {
    throw new Error(
      'The homepage demo seed intent does not match the validated plan.',
    );
  }

  return new PrismaDemoSeedWriteGateway(dependencies);
}

class PrismaDemoSeedWriteGateway implements DemoSeedWriteGateway {
  private readonly audit: AuditService;
  private readonly campaigns: CampaignService;
  private readonly blog: BlogService;
  private readonly cache: StorefrontCacheService;
  private readonly draft: HomepageDraftService;
  private readonly source = new HomepageSourceService();
  private readonly media: MerchMediaService;
  private readonly storage: LocalDiskMediaStorage;
  private readonly manifest: DemoSeedManifest;

  constructor(private readonly dependencies: WriterDependencies) {
    this.manifest = dependencies.planInput.manifest;
    this.audit = new AuditService(dependencies.prisma);
    this.campaigns = new CampaignService(dependencies.prisma, this.audit);
    this.cache = new StorefrontCacheService(new ConfigService({}));
    this.blog = new BlogService(
      dependencies.prisma,
      this.audit,
      this.cache,
    );
    this.draft = new HomepageDraftService(
      dependencies.prisma,
      this.audit,
      this.source,
    );

    const storageDir =
      process.env.PRODUCT_MEDIA_STORAGE_DIR ?? '.data/product-media';
    const tempDir =
      process.env.PRODUCT_MEDIA_TEMP_DIR ?? join(storageDir, 'tmp');
    const watermark = resolveWatermarkConfig();
    const overlay = new WatermarkOverlayService(watermark);
    const imageProcessor = new ImageProcessorService(overlay, watermark);
    const videoProcessor = new VideoProcessorService(
      overlay,
      new FfmpegRunner(FfmpegRunner.resolveBinary()),
      watermark,
      tempDir,
    );
    const processing = new MediaProcessingService(
      imageProcessor,
      videoProcessor,
      watermark,
    );
    this.storage = new LocalDiskMediaStorage(storageDir);
    this.media = new MerchMediaService(
      dependencies.prisma,
      this.audit,
      this.storage,
      processing,
      tempDir,
    );
  }

  async upsertCampaign(
    definitionKey: string,
  ): Promise<{ id: string; action: 'create' | 'update' | 'reuse' }> {
    const definition = this.requireCampaign(definitionKey);
    const rows = await this.dependencies.prisma.merchCampaign.findMany({
      where: { internalName: definition.internalName },
      select: {
        id: true,
        internalName: true,
        createdBy: true,
        updatedBy: true,
        archivedAt: true,
      },
    });
    if (rows.length > 1) {
      throw new Error(
        `Ambiguous campaign ownership: multiple rows for ${definition.internalName}.`,
      );
    }
    const existing = rows[0] ?? null;
    const ownership = campaignOwnership(existing, definition.internalName);
    if (ownership === 'manually-edited' || ownership === 'ambiguous') {
      throw new Error(
        `Campaign ${definition.internalName} is not safely demo-owned (${ownership}).`,
      );
    }
    if (existing !== null && existing.archivedAt !== null) {
      throw new Error(
        `Campaign ${definition.internalName} is archived; refusing to create or update it.`,
      );
    }

    const payload = campaignPayload(
      definition,
      this.dependencies.plan.candidates,
    );
    const media = await this.campaignMedia(definition);
    const body = {
      ...payload,
      media,
    };

    const result =
      existing === null
        ? {
            id: (
              await this.campaigns.create(
                DEMO_SEED_ACTOR_ID,
                body,
                undefined,
                this.dependencies.fence,
              )
            ).id,
            action: 'create' as const,
          }
        : {
            id: (
              await this.campaigns.update(
                existing.id,
                DEMO_SEED_ACTOR_ID,
                body,
                undefined,
                this.dependencies.fence,
                {
                  beforeWrite: (row) => {
                    if (
                      row.internalName !== definition.internalName ||
                      row.createdBy !== DEMO_SEED_ACTOR_ID ||
                      (row.updatedBy !== null &&
                        row.updatedBy !== DEMO_SEED_ACTOR_ID) ||
                      row.archivedAt !== null
                    ) {
                      throw new Error(
                        `Campaign ${definition.internalName} changed outside the demo seed; refusing to overwrite it.`,
                      );
                    }
                  },
                },
              )
            ).id,
            action: 'update' as const,
          };

    await this.assertCampaignOwned(result.id, definition.internalName);
    return result;
  }

  async mediaStorageIdentity(definitionKey: string): Promise<{
    action: 'create' | 'reuse';
    storageKey: string;
    thumbnailKey: string | null;
  }> {
    const definition = this.requireMedia(definitionKey);
    const expectedName = expectedMediaOriginalName(definition);
    const asset = this.dependencies.planInput.assets[definition.key];
    if (!asset || !asset.exists || asset.sha256 === null) {
      throw new MediaStorageConflictError(
        definition.key,
        `Approved media asset ${definition.key} is missing or has no verified SHA-256; refusing to reuse or upload media.`,
      );
    }
    const rows = await this.dependencies.prisma.merchMedia.findMany({
      where: { originalName: expectedName },
      select: {
        id: true,
        originalName: true,
        createdBy: true,
        publishedAt: true,
        deletedAt: true,
        storageKey: true,
        thumbnailKey: true,
        sizeBytes: true,
        sourceSha256: true,
        processedSha256: true,
        thumbnailSha256: true,
      },
    });
    if (rows.length > 1) {
      throw new Error(
        `Ambiguous media ownership: multiple rows for ${expectedName}.`,
      );
    }
    const existing = rows[0] ?? null;
    if (existing === null) {
      const keys = demoMediaStorageKeys(
        this.dependencies.intent.operationId,
        definition,
      );
      return { action: 'create', ...keys };
    }
    const ownership = mediaOwnership(
      {
        ...existing,
        publishedAt: existing.publishedAt?.toISOString() ?? null,
        deletedAt: existing.deletedAt?.toISOString() ?? null,
      },
      expectedName,
    );
    if (ownership === 'manually-edited' || ownership === 'ambiguous') {
      throw new Error(
        `Media ${expectedName} is not safely demo-owned (${ownership}).`,
      );
    }
    await assertStoredMediaProvenance(this.storage, existing, asset);
    return {
      action: 'reuse',
      storageKey: existing.storageKey,
      thumbnailKey: existing.thumbnailKey,
    };
  }

  async uploadOrReuseMedia(definitionKey: string): Promise<{
    id: string;
    action: 'create' | 'reuse' | 'recovered';
    storageAction: 'written' | 'reused-verified-orphan' | 'reused-row';
    storageKey: string;
    thumbnailKey: string | null;
  }> {
    const definition = this.requireMedia(definitionKey);
    const expectedName = expectedMediaOriginalName(definition);
    const asset = this.dependencies.planInput.assets[definition.key];
    if (!asset || !asset.exists || asset.sha256 === null) {
      throw new MediaStorageConflictError(
        definition.key,
        `Approved media asset ${definition.key} is missing or has no verified SHA-256; refusing to reuse or upload media. Restore the approved asset or start a new reviewed operation.`,
      );
    }

    const rows = await this.dependencies.prisma.merchMedia.findMany({
      where: { originalName: expectedName },
      select: {
        id: true,
        originalName: true,
        createdBy: true,
        publishedAt: true,
        deletedAt: true,
        storageKey: true,
        thumbnailKey: true,
        sizeBytes: true,
        sourceSha256: true,
        processedSha256: true,
        thumbnailSha256: true,
      },
    });
    if (rows.length > 1) {
      throw new Error(
        `Ambiguous media ownership: multiple rows for ${expectedName}.`,
      );
    }
    const existing = rows[0] ?? null;
    const ownership = mediaOwnership(
      existing
        ? {
            ...existing,
            publishedAt: existing.publishedAt?.toISOString() ?? null,
            deletedAt: existing.deletedAt?.toISOString() ?? null,
          }
        : null,
      expectedName,
    );
    if (ownership === 'manually-edited' || ownership === 'ambiguous') {
      throw new Error(
        `Media ${expectedName} is not safely demo-owned (${ownership}).`,
      );
    }
    if (existing !== null) {
      await assertStoredMediaProvenance(this.storage, existing, asset);
      return {
        id: existing.id,
        action: 'reuse',
        storageAction: 'reused-row',
        storageKey: existing.storageKey,
        thumbnailKey: existing.thumbnailKey,
      };
    }

    assertMediaAssetKey(definition.key);
    const storageDir =
      process.env.PRODUCT_MEDIA_STORAGE_DIR ?? '.data/product-media';
    const tempDir =
      process.env.PRODUCT_MEDIA_TEMP_DIR ?? join(storageDir, 'tmp');
    await mkdir(tempDir, { recursive: true });
    const extension = extensionFor(definition.mimeType);
    const tempPath = join(
      tempDir,
      `${DEMO_MEDIA_NAME_PREFIX}${definition.key}-${randomUUID()}.${extension}`,
    );
    await copyVerifiedAsset(asset, tempPath);

    const storageKeys = demoMediaStorageKeys(
      this.dependencies.intent.operationId,
      definition,
    );
    const storageState: { action: 'written' | 'reused-verified' } = {
      action: 'written',
    };
    let storedKeys: { storageKey: string; thumbnailKey: string | null } = {
      storageKey: storageKeys.storageKey,
      thumbnailKey: storageKeys.thumbnailKey,
    };
    try {
      const created = await this.media.upload(
        {
          path: tempPath,
          originalname: `${DEMO_MEDIA_NAME_PREFIX}${definition.key}-${definition.fileName}`,
          mimetype: definition.mimeType,
        } as Express.Multer.File,
        { altFa: definition.altFa },
        DEMO_SEED_ACTOR_ID,
        undefined,
        {
          storageKeys,
          fence: this.dependencies.fence,
          idempotentStorage: true,
          sourceSha256: asset.sha256,
          onStorageAction: (action) => {
            storageState.action = action;
          },
          onStoredKeys: (keys) => {
            storedKeys = keys;
          },
        },
      );
      return {
        id: created.id,
        action:
          storageState.action === 'reused-verified' ? 'recovered' : 'create',
        storageAction:
          storageState.action === 'reused-verified'
            ? 'reused-verified-orphan'
            : 'written',
        storageKey: storedKeys.storageKey,
        thumbnailKey: storedKeys.thumbnailKey,
      };
    } finally {
      await rm(tempPath, { force: true }).catch(() => undefined);
    }
  }

  async upsertBlogPost(
    definitionKey: string,
  ): Promise<{ id: string; action: 'create' | 'update' | 'reuse' }> {
    const definition = this.requireBlog(definitionKey);
    const existing = await this.dependencies.prisma.blogPost.findUnique({
      where: { slug: definition.slug },
      select: {
        id: true,
        slug: true,
        status: true,
        createdBy: true,
        updatedBy: true,
        publishedAt: true,
        title: true,
        excerpt: true,
        content: true,
        coverImageUrl: true,
        authorName: true,
        metaTitle: true,
        metaDescription: true,
        categoryId: true,
      },
    });
    const ownership = blogOwnership(
      existing
        ? {
            ...existing,
            publishedAt: existing.publishedAt?.toISOString() ?? null,
          }
        : null,
      definition.slug,
    );
    if (ownership === 'manually-edited' || ownership === 'ambiguous') {
      throw new Error(
        `Blog post ${definition.slug} is not safely demo-owned (${ownership}).`,
      );
    }

    const coverImageUrl = await this.blogCoverUrl(definition);

    if (existing === null) {
      const created = await this.blog.createPost(
        DEMO_SEED_ACTOR_ID,
        {
          slug: definition.slug,
          title: definition.title,
          excerpt: definition.excerpt ?? undefined,
          content: definition.content,
          coverImageUrl: coverImageUrl ?? undefined,
          authorName: definition.authorName ?? undefined,
          status: BlogStatus.DRAFT,
        },
        undefined,
        this.dependencies.fence,
      );
      return { id: created.id, action: 'create' };
    }

    if (existing.status === BlogStatus.PUBLISHED) {
      assertPublishedBlogUnchanged({
        slug: definition.slug,
        existing: {
          title: existing.title,
          excerpt: existing.excerpt,
          content: existing.content,
          coverImageUrl: existing.coverImageUrl,
          authorName: existing.authorName,
          metaTitle: existing.metaTitle,
          metaDescription: existing.metaDescription,
          categoryId: existing.categoryId,
        },
        desired: {
          title: definition.title,
          excerpt: definition.excerpt ?? null,
          content: sanitizeRichText(definition.content),
          coverImageUrl,
          authorName: definition.authorName ?? null,
          metaTitle: null,
          metaDescription: null,
          categoryId: null,
        },
      });
      return { id: existing.id, action: 'reuse' };
    }

    const updated = await this.blog.updatePost(
      DEMO_SEED_ACTOR_ID,
      existing.id,
      {
        title: definition.title,
        excerpt: definition.excerpt,
        content: definition.content,
        coverImageUrl,
        authorName: definition.authorName,
        status: BlogStatus.DRAFT,
      },
      undefined,
      this.dependencies.fence,
      {
        beforeWrite: (row) => {
          if (
            row.slug !== definition.slug ||
            row.createdBy !== DEMO_SEED_ACTOR_ID ||
            (row.updatedBy !== null &&
              row.updatedBy !== DEMO_SEED_ACTOR_ID)
          ) {
            throw new Error(
              `Blog post ${definition.slug} changed outside the demo seed; refusing to overwrite it.`,
            );
          }
        },
      },
    );
    return { id: updated.id, action: 'update' };
  }

  async applyDraftAndPublication(): Promise<DemoDraftApplyResult> {
    const campaignIds = await this.resolveCampaignIds();
    const mediaIds = await this.resolveMediaIds();
    const blogIds = await this.resolveBlogIds();
    const spotlightCategoryId =
      this.dependencies.plan.candidates.categories[0]?.id;
    if (!spotlightCategoryId) {
      throw new Error('No category candidate is available for the spotlight.');
    }

    const sections = buildHomepageSections(this.manifest, {
      campaignIds,
      blogPostIds: blogIds,
      spotlightCategoryId,
    });
    const intent = this.dependencies.intent;
    const authorization = sealAuthorization({
      operationId: intent.operationId,
      intentHash: intent.intentHash,
      planHash: intent.planHash,
      identityFingerprint: intent.identityFingerprint,
      manifestHash: intent.manifestHash,
      assetsHash: hashJson(intent.assets),
      publicationMode: intent.publicationMode,
      acknowledgedMediaIds: Object.freeze(sortedUnique(intent.mediaAckIds)),
      expectedRevision: this.dependencies.plan.draft.sourceRevision,
      expectedPublishedVersions: Object.freeze(
        [...this.dependencies.plan.publication.currentPublishedVersions].sort(
          (a, b) => a - b,
        ),
      ),
      expectedAffectedMediaIds: Object.freeze(
        sortedUnique(
          this.dependencies.plan.mediaReconciliation.affected.map(
            (row) => row.id,
          ),
        ),
      ),
      newSnapshotMediaIds: Object.freeze(
        sortedUnique(Object.values(mediaIds)),
      ),
      blogPostIds: Object.freeze(sortedUnique(Object.values(blogIds))),
      sections: Object.freeze(sections),
      sectionsHash: computeSectionsHash(sections),
      campaignIds: Object.freeze({ ...campaignIds }),
      mediaIds: Object.freeze({ ...mediaIds }),
      blogIds: Object.freeze({ ...blogIds }),
    });

    return this.applyAuthorized(authorization);
  }

  private async applyAuthorized(
    authorization: DemoSeedWriteAuthorization,
  ): Promise<DemoDraftApplyResult> {
    assertSealedAuthorization(authorization);
    assertApprovedManifest(this.manifest);
    if (
      !sameIdSet(
        Object.keys(authorization.campaignIds),
        this.manifest.campaigns.map((campaign) => campaign.key),
      ) ||
      !sameIdSet(
        Object.keys(authorization.mediaIds),
        this.manifest.media.map((asset) => asset.key),
      ) ||
      !sameIdSet(
        Object.keys(authorization.blogIds),
        this.manifest.blog.map((article) => article.key),
      )
    ) {
      throw new Error(
        'Homepage demo seed authorization does not cover the exact manifest key set.',
      );
    }

    const intent = this.dependencies.intent;
    const manifestHash = computeManifestHash(this.manifest);
    const assets = computeAssetsIntent(this.dependencies.planInput);
    const expected = {
      operationId: intent.operationId,
      intentHash: intent.intentHash,
      planHash: computePlanHash({
        manifestHash,
        identityFingerprint:
          this.dependencies.planInput.identity.fingerprint,
        assets,
        publicationMode: intent.publicationMode,
        mediaAckIds: intent.mediaAckIds,
      }),
      identityFingerprint: intent.identityFingerprint,
      manifestHash,
      assetsHash: hashJson(assets),
      publicationMode: intent.publicationMode,
      acknowledgedMediaIds: intent.mediaAckIds,
      expectedRevision: this.dependencies.plan.draft.sourceRevision,
      expectedPublishedVersions:
        this.dependencies.plan.publication.currentPublishedVersions,
      expectedAffectedMediaIds:
        this.dependencies.plan.mediaReconciliation.affected.map(
          (row) => row.id,
        ),
      newSnapshotMediaIds: Object.values(authorization.mediaIds),
      blogPostIds: Object.values(authorization.blogIds),
      sectionsHash: computeSectionsHash(
        buildHomepageSections(this.manifest, {
          campaignIds: { ...authorization.campaignIds },
          blogPostIds: { ...authorization.blogIds },
          spotlightCategoryId:
            this.dependencies.plan.candidates.categories[0]?.id ?? '',
        }),
      ),
    };
    assertAuthorizationBindings(authorization, expected);
    assertPublicationAcknowledgement({
      publish: authorization.publicationMode === 'publish',
      expectedPublishedVersions: [...authorization.expectedPublishedVersions],
      acknowledged:
        this.dependencies.planInput.options.acknowledgePublicationReplacement,
    });
    if (
      authorization.publicationMode === 'draft' &&
      this.manifest.blog.some((article) => article.publish)
    ) {
      throw new Error(
        'Blog activation requires homepage publication in the same transaction.',
      );
    }

    const result = await this.dependencies.prisma.$transaction(
      async (tx) => {
        await this.dependencies.fence.lockWithinTransaction(tx);
        await lockHomepagePublicationSources(tx);

        const journal = await this.lockJournal(
          tx,
          authorization.operationId,
          authorization.intentHash,
        );
        const identity = await readDatabaseIdentity(tx);
        if (identity.fingerprint !== authorization.identityFingerprint) {
          throw new Error(
            'The database identity changed before the final demo publication transaction.',
          );
        }

        const draft = await this.draft.lockCurrentDraft(
          tx,
          DEMO_SEED_ACTOR_ID,
        );
        assertDraftState({
          expectedRevision: authorization.expectedRevision,
          currentRevision: draft.revision,
          currentSectionCount: draft.sections.length,
          replaceDraft: this.dependencies.planInput.options.replaceDraft,
        });

        const published = await tx.homepagePublication.findMany({
          where: { status: 'PUBLISHED' },
          select: { version: true },
        });
        const publishedVersions = published.map((row) => row.version);
        assertPublishedState(
          [...authorization.expectedPublishedVersions],
          publishedVersions,
        );

        const now = new Date();

        // Lock and revalidate the exact final blog rows before any state is
        // changed. Activation must happen before snapshot construction because
        // BLOG_FEATURE validation requires referenced posts to be PUBLISHED,
        // and the snapshot must observe this transaction's activation.
        await this.resolveOwnedRows(tx, authorization);
        const finalBlogRows = await lockAndValidateFinalBlogRows(tx, {
          manifest: this.manifest,
          blogIds: authorization.blogIds,
          mediaIds: authorization.mediaIds,
          publicApiBaseUrl:
            this.dependencies.planInput.options.publicApiBaseUrl,
        });

        if (authorization.publicationMode === 'publish') {
          const activatedBlogIds = await activateFinalBlogRows(
            tx,
            {
              manifest: this.manifest,
              blogIds: authorization.blogIds,
            },
            finalBlogRows,
            now,
          );
          await this.audit.log(
            {
              userId: DEMO_SEED_ACTOR_ID,
              action: 'HOMEPAGE_DEMO_BLOGS_ACTIVATED',
              entity: 'BlogPost',
              after: { postIds: activatedBlogIds },
            },
            tx,
          );
        }

        // Build the exact snapshot after activation. This remains inside the
        // same transaction, so the builder observes the just-written PUBLISHED
        // status and no blog state is independently committed.
        const built = await this.source.buildSnapshot(
          tx,
          [...authorization.sections],
          {
            now,
            windowPolicy:
              authorization.publicationMode === 'publish'
                ? 'require-active-window'
                : 'allow-future-start',
          },
        );
        if (!built.snapshot || built.errors.length > 0) {
          throw new Error(
            `Homepage draft validation failed: ${built.errors
              .map((error) => error.message)
              .join('; ')}`,
          );
        }

        if (authorization.publicationMode === 'publish') {
          const visibleMediaIds = [...collectVisibleMediaIds(built.snapshot)].sort();
          if (!sameIdSet(visibleMediaIds, authorization.newSnapshotMediaIds)) {
            throw new Error(
              'Manifest media visibility changed: the plan assumed every demo media row would remain public, but the built homepage snapshot does not reference the exact planned set. Re-run the plan and acknowledge the correct affected media set.',
            );
          }
          const visibleSet = new Set(visibleMediaIds);
          const publishedMedia = await tx.merchMedia.findMany({
            where: { publishedAt: { not: null } },
            select: { id: true },
          });
          const actualAffectedIds = publishedMedia
            .map((row) => row.id)
            .filter((id) => !visibleSet.has(id));
          assertMediaReconciliation({
            expectedAffectedIds: [...authorization.expectedAffectedMediaIds],
            actualAffectedIds,
            acknowledgedIds: [...authorization.acknowledgedMediaIds],
          });
        }

        const updated = await tx.homepageDraft.update({
          where: { id: MERCH_HOMEPAGE_DRAFT_ID },
          data: {
            revision: { increment: 1 },
            schemaVersion: MERCH_HOMEPAGE_SCHEMA_VERSION,
            sections: [...authorization.sections] as unknown as Prisma.InputJsonValue,
            updatedBy: DEMO_SEED_ACTOR_ID,
          },
        });

        let publicationId: string | null = null;
        let publicationVersion: number | null = null;
        const supersededVersions: number[] = [];
        if (authorization.publicationMode === 'publish') {
          if (published.length > 0) {
            await tx.homepagePublication.updateMany({
              where: { status: 'PUBLISHED' },
              data: { status: 'SUPERSEDED' },
            });
            supersededVersions.push(...publishedVersions);
          }
          const max = await tx.homepagePublication.aggregate({
            _max: { version: true },
          });
          publicationVersion = (max._max.version ?? 0) + 1;
          const publication = await tx.homepagePublication.create({
            data: {
              version: publicationVersion,
              demoSeedOperationId: authorization.operationId,
              status: 'PUBLISHED',
              publishAt: null,
              publishedAt: now,
              sections: built.snapshot as unknown as Prisma.InputJsonValue,
              schemaVersion: built.snapshot.schemaVersion,
              sourceDraftRevision: updated.revision,
              note: 'Homepage demo seed',
              createdBy: DEMO_SEED_ACTOR_ID,
              publishedBy: DEMO_SEED_ACTOR_ID,
            },
          });
          publicationId = publication.id;
          await reconcilePublishedMediaEligibility(
            tx,
            built.snapshot,
            now,
            DEMO_SEED_ACTOR_ID,
          );
          await this.audit.log(
            {
              userId: DEMO_SEED_ACTOR_ID,
              action: 'HOMEPAGE_DEMO_PUBLICATION_CREATED',
              entity: 'HomepagePublication',
              entityId: publication.id,
              before:
                supersededVersions.length > 0
                  ? { supersededVersions }
                  : null,
              after: {
                version: publicationVersion,
                sourceDraftRevision: updated.revision,
                operationId: authorization.operationId,
              },
            },
            tx,
          );
        }

        await this.audit.log(
          {
            userId: DEMO_SEED_ACTOR_ID,
            action: 'HOMEPAGE_DEMO_DRAFT_REPLACED',
            entity: 'HomepageDraft',
            entityId: MERCH_HOMEPAGE_DRAFT_ID,
            before: {
              revision: draft.revision,
              sectionCount: draft.sections.length,
            },
            after: {
              revision: updated.revision,
              sectionCount: authorization.sections.length,
              publicationVersion,
            },
          },
          tx,
        );

        const result: DemoSeedOperationResult = {
          campaigns: { ...authorization.campaignIds },
          media: { ...authorization.mediaIds },
          blog: { ...authorization.blogIds },
          backup: this.dependencies.backup,
          draft: {
            revision: updated.revision,
            publicationId,
            publicationVersion,
            supersededVersions,
          },
        };

        await completeDemoSeedOperationWithinTransaction(tx, {
          operationId: authorization.operationId,
          intentHash: authorization.intentHash,
          expectedState: journal.state,
          publicationMode: authorization.publicationMode,
          publicationId,
          publicationVersion,
          draftRevision: updated.revision,
          result,
          completedAt: now,
          fence: this.dependencies.fence,
        });

        return {
          revision: updated.revision,
          publicationId,
          publicationVersion,
          supersededVersions,
        };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    if (authorization.publicationMode === 'publish') {
      void this.cache.invalidate([
        BLOG_POSTS_TAG,
        ...this.manifest.blog.map((article) => blogPostTag(article.slug)),
      ]);
    }
    return result;
  }

  private async lockJournal(
    tx: Prisma.TransactionClient,
    operationId: string,
    intentHash: string,
  ): Promise<{ state: string }> {
    const rows = await tx.$queryRaw<Array<{ state: string; intentHash: string | null }>>`
      SELECT "state", "intentHash"
      FROM "HomepageDemoSeedOperation"
      WHERE "id" = ${operationId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (rows.length !== 1 || row === undefined) {
      throw new Error(
        `Homepage demo seed journal ${operationId} does not exist.`,
      );
    }
    if (row.intentHash !== intentHash) {
      throw new Error(
        'The homepage demo seed journal intent changed before the final transaction.',
      );
    }
    if (row.state === 'COMPLETED') {
      throw new Error(
        `Operation ${operationId} is already completed; refusing a second publication.`,
      );
    }
    return { state: row.state };
  }

  private async resolveOwnedRows(
    tx: Prisma.TransactionClient,
    authorization: DemoSeedWriteAuthorization,
  ): Promise<ResolvedRows> {
    const campaignIds = Object.values(authorization.campaignIds);
    const mediaIds = Object.values(authorization.mediaIds);

    const campaigns = await tx.merchCampaign.findMany({
      where: { id: { in: campaignIds } },
      select: {
        id: true,
        internalName: true,
        createdBy: true,
        updatedBy: true,
        archivedAt: true,
      },
    });
    const media = await tx.merchMedia.findMany({
      where: { id: { in: mediaIds } },
      select: {
        id: true,
        originalName: true,
        storageKey: true,
        thumbnailKey: true,
        sizeBytes: true,
        sourceSha256: true,
        processedSha256: true,
        thumbnailSha256: true,
        createdBy: true,
        publishedAt: true,
        deletedAt: true,
      },
    });
    if (
      campaigns.length !== campaignIds.length ||
      media.length !== mediaIds.length
    ) {
      throw new Error(
        'One or more demo rows disappeared before the final transaction.',
      );
    }

    for (const [key, id] of Object.entries(authorization.campaignIds)) {
      const definition = this.requireCampaign(key);
      const row = campaigns.find((item) => item.id === id);
      if (
        !row ||
        row.internalName !== definition.internalName ||
        row.createdBy !== DEMO_SEED_ACTOR_ID ||
        (row.updatedBy !== null && row.updatedBy !== DEMO_SEED_ACTOR_ID) ||
        row.archivedAt !== null
      ) {
        throw new Error(
          `Campaign ${definition.internalName} is not safely demo-owned at the final boundary.`,
        );
      }
    }
    for (const [key, id] of Object.entries(authorization.mediaIds)) {
      const definition = this.requireMedia(key);
      const row = media.find((item) => item.id === id);
      if (
        !row ||
        row.originalName !== expectedMediaOriginalName(definition) ||
        row.createdBy !== DEMO_SEED_ACTOR_ID ||
        row.deletedAt !== null
      ) {
        throw new Error(
          `Media ${expectedMediaOriginalName(definition)} is not safely demo-owned at the final boundary.`,
        );
      }
      await assertStoredMediaProvenance(
        this.storage,
        row,
        this.dependencies.planInput.assets[key] ?? { sha256: null },
      );
    }
    return { campaigns, media };
  }

  private async resolveCampaignIds(): Promise<Record<string, string>> {
    const ids: Record<string, string> = {};
    for (const definition of this.manifest.campaigns) {
      const rows = await this.dependencies.prisma.merchCampaign.findMany({
        where: { internalName: definition.internalName },
        select: { id: true },
      });
      const row = rows[0];
      if (rows.length !== 1 || row === undefined) {
        throw new Error(
          `Expected exactly one demo campaign for ${definition.internalName}, found ${rows.length}.`,
        );
      }
      ids[definition.key] = row.id;
    }
    return ids;
  }

  private async resolveMediaIds(): Promise<Record<string, string>> {
    const ids: Record<string, string> = {};
    for (const definition of this.manifest.media) {
      const rows = await this.dependencies.prisma.merchMedia.findMany({
        where: { originalName: expectedMediaOriginalName(definition) },
        select: { id: true },
      });
      const row = rows[0];
      if (rows.length !== 1 || row === undefined) {
        throw new Error(
          `Expected exactly one demo media row for ${definition.key}, found ${rows.length}.`,
        );
      }
      ids[definition.key] = row.id;
    }
    return ids;
  }

  private async resolveBlogIds(): Promise<Record<string, string>> {
    const ids: Record<string, string> = {};
    for (const definition of this.manifest.blog) {
      const rows = await this.dependencies.prisma.blogPost.findMany({
        where: { slug: definition.slug },
        select: { id: true },
      });
      const row = rows[0];
      if (rows.length !== 1 || row === undefined) {
        throw new Error(
          `Expected exactly one demo blog post for ${definition.slug}, found ${rows.length}.`,
        );
      }
      ids[definition.key] = row.id;
    }
    return ids;
  }

  private async campaignMedia(
    definition: DemoCampaignDefinition,
  ): Promise<Array<{ mediaId: string; slot: string; altFa: string }>> {
    const media: Array<{ mediaId: string; slot: string; altFa: string }> = [];
    for (const key of definition.mediaKeys) {
      const asset = this.manifest.media.find((item) => item.key === key);
      if (!asset) {
        throw new Error(
          `Campaign ${definition.key} references unknown media ${key}.`,
        );
      }
      const rows = await this.dependencies.prisma.merchMedia.findMany({
        where: { originalName: expectedMediaOriginalName(asset) },
        select: {
          id: true,
          originalName: true,
          createdBy: true,
          publishedAt: true,
          deletedAt: true,
        },
      });
      const row = rows[0];
      if (rows.length !== 1 || row === undefined) {
        throw new Error(
          `Expected exactly one demo media row for ${asset.key}, found ${rows.length}.`,
        );
      }
      const ownership = mediaOwnership(
        {
          ...row,
          publishedAt: row.publishedAt?.toISOString() ?? null,
          deletedAt: row.deletedAt?.toISOString() ?? null,
        },
        expectedMediaOriginalName(asset),
      );
      if (ownership !== 'owned') {
        throw new Error(
          `Media ${asset.key} is not safely demo-owned for campaign assignment (${ownership}).`,
        );
      }
      media.push({
        mediaId: row.id,
        slot: asset.slot,
        altFa: asset.altFa,
      });
    }
    return media;
  }

  private async blogCoverUrl(
    definition: DemoBlogArticleDefinition,
  ): Promise<string | null> {
    if (definition.coverAssetKey === null) return null;
    const asset = this.manifest.media.find(
      (item) => item.key === definition.coverAssetKey,
    );
    if (!asset) {
      throw new Error(
        `Blog ${definition.key} references unknown cover media ${definition.coverAssetKey}.`,
      );
    }
    const rows = await this.dependencies.prisma.merchMedia.findMany({
      where: { originalName: expectedMediaOriginalName(asset) },
      select: {
        id: true,
        originalName: true,
        createdBy: true,
        publishedAt: true,
        deletedAt: true,
      },
    });
    const row = rows[0];
    if (rows.length !== 1 || row === undefined) {
      throw new Error(
        `Expected exactly one demo cover media row for ${asset.key}, found ${rows.length}.`,
      );
    }
    const ownership = mediaOwnership(
      {
        ...row,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        deletedAt: row.deletedAt?.toISOString() ?? null,
      },
      expectedMediaOriginalName(asset),
    );
    if (ownership !== 'owned') {
      throw new Error(
        `Cover media ${asset.key} is not safely demo-owned (${ownership}).`,
      );
    }
    const base = this.dependencies.planInput.options.publicApiBaseUrl;
    if (!base) {
      throw new Error(
        'A public API base URL is required for demo blog covers.',
      );
    }
    return `${base.replace(/\/+$/, '')}/catalog/merch-media/${row.id}`;
  }

  private async assertCampaignOwned(
    id: string,
    internalName: string,
  ): Promise<void> {
    const row = await this.dependencies.prisma.merchCampaign.findUnique({
      where: { id },
      select: {
        internalName: true,
        createdBy: true,
        updatedBy: true,
        archivedAt: true,
      },
    });
    if (
      !row ||
      row.internalName !== internalName ||
      row.createdBy !== DEMO_SEED_ACTOR_ID ||
      (row.updatedBy !== null && row.updatedBy !== DEMO_SEED_ACTOR_ID) ||
      row.archivedAt !== null
    ) {
      throw new Error(
        `Campaign ${internalName} is not safely demo-owned after the write.`,
      );
    }
  }

  private requireCampaign(key: string): DemoCampaignDefinition {
    const definition = this.manifest.campaigns.find(
      (campaign) => campaign.key === key,
    );
    if (!definition) {
      throw new Error(`Manifest campaign ${key} does not exist.`);
    }
    return definition;
  }

  private requireMedia(key: string): DemoMediaAssetDefinition {
    const definition = this.manifest.media.find((asset) => asset.key === key);
    if (!definition) {
      throw new Error(`Manifest media ${key} does not exist.`);
    }
    return definition;
  }

  private requireBlog(key: string): DemoBlogArticleDefinition {
    const definition = this.manifest.blog.find(
      (article) => article.key === key,
    );
    if (!definition) {
      throw new Error(`Manifest blog article ${key} does not exist.`);
    }
    return definition;
  }
}

function extensionFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}
