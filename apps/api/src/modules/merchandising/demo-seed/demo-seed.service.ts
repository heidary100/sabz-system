import { createDraftBackup } from './backup';
import type { DraftBackupResult } from './backup';
import {
  buildDemoSeedPlan,
  DemoSeedBlockedError,
} from './planner';
import type { DemoSeedPlanLoader } from './plan-loader';
import { assertOperationId } from './operation-id';
import {
  buildDemoSeedIntent,
  computeAssetsIntent,
  type DemoSeedIntent,
} from './intent';
import type {
  DemoSeedFence,
} from './demo-fence';
import type {
  DemoSeedGuardrails,
  DemoSeedJournalHandle,
} from './guardrails';
import { MediaStorageConflictError } from '../media/idempotent-media-storage';
import type {
  DemoDraftApplyResult,
  DemoSeedManifest,
  DemoSeedOperationResult,
  DemoSeedOptions,
  DemoSeedPlan,
  DemoSeedPlanInput,
  DemoSeedWriteGateway,
} from './types';

export interface DemoSeedWriteGatewayInput {
  fence: DemoSeedFence;
  plan: DemoSeedPlan;
  planInput: DemoSeedPlanInput;
  intent: DemoSeedIntent;
  backup: DraftBackupResult | null;
}

export type DemoSeedWriteGatewayFactory = (
  input: DemoSeedWriteGatewayInput,
) => DemoSeedWriteGateway;

export interface DemoSeedApplyResult {
  operationId: string;
  plan: DemoSeedPlan;
  backup: DraftBackupResult | null;
  campaigns: Record<string, string>;
  media: Record<string, string>;
  blog: Record<string, string>;
  draft: DemoDraftApplyResult;
  /** True when this apply returned the stored result of a completed operation. */
  replayed: boolean;
}

/**
 * Orchestrates identity -> plan -> guarded apply.
 *
 * `plan` performs all reads through the injected read-only loader. The write
 * gateway is never constructed for identity, plan, or replay operations.
 */
export class DemoSeedService {
  constructor(
    private readonly loader: DemoSeedPlanLoader,
    private readonly createWriteGateway: DemoSeedWriteGatewayFactory,
    private readonly guardrails: DemoSeedGuardrails,
    private readonly backup = createDraftBackup,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async plan(
    options: DemoSeedOptions,
    manifest: DemoSeedManifest,
  ): Promise<{ input: DemoSeedPlanInput; plan: DemoSeedPlan }> {
    const input = await this.loader.load(options, manifest);
    return { input, plan: buildDemoSeedPlan(input) };
  }

  private replayResult(
    operationId: string,
    plan: DemoSeedPlan,
    completion: {
      result: unknown | null;
    },
  ): DemoSeedApplyResult {
    const result = completion.result as DemoSeedOperationResult | null;
    if (result === null) {
      throw new Error(
        `Operation ${operationId} is completed but its stored result is missing; inspect the journal manually.`,
      );
    }
    return {
      operationId,
      plan,
      backup: result.backup,
      campaigns: result.campaigns,
      media: result.media,
      blog: result.blog,
      draft: result.draft,
      replayed: true,
    };
  }

  async apply(
    options: DemoSeedOptions,
    manifest: DemoSeedManifest,
  ): Promise<DemoSeedApplyResult> {
    const operationId = assertOperationId(options.operationId);
    const lock = await this.guardrails.acquireLock(operationId);
    let journal: DemoSeedJournalHandle | null = null;
    try {
      await lock.assertHeld();
      const { input, plan } = await this.plan(options, manifest);
      if (input.options.operationId !== operationId) {
        throw new Error(
          'The loaded plan operation id does not match the requested operation id.',
        );
      }
      const intent = buildDemoSeedIntent({
        operationId,
        identity: input.identity,
        manifest: input.manifest,
        assets: computeAssetsIntent(input),
        plan,
        input,
        options: input.options,
      });

      // Read-only check before creating or mutating journal state. A blocked
      // apply must not leave a FAILED journal row behind.
      const completion = await this.guardrails.readCompletion({
        operationId,
        planHash: intent.planHash,
        intentHash: intent.intentHash,
      });
      if (completion !== null) {
        return this.replayResult(operationId, plan, completion);
      }

      if (!plan.applyPermitted) {
        throw new DemoSeedBlockedError(plan.blockers);
      }

      journal = await this.guardrails.openJournal({
        operationId,
        planHash: intent.planHash,
        intentHash: intent.intentHash,
        baselineHash: intent.baselineHash,
        intent: { content: intent.payload, baseline: intent.baseline },
        fence: lock,
      });

      if (journal.completed !== null) {
        return this.replayResult(operationId, plan, journal.completed);
      }

      await journal.recordMediaReconciliation(
        plan.mediaReconciliation.affected.map((row) => row.id),
        input.options.mediaReconciliationAckIds,
      );
      await journal.advance('PLANNED', {
        fingerprint: plan.identity.fingerprint,
        intentHash: intent.intentHash,
      });

      let backup: DraftBackupResult | null = null;
      if (plan.draft.requiresBackup) {
        if (input.baseline.draft === null) {
          throw new Error('Backup was required but no draft snapshot was loaded.');
        }
        await lock.assertHeld();
        backup = await this.backup({
          backupDir: input.options.backupDir,
          identity: input.identity,
          draft: input.baseline.draft,
          operationId,
          now: this.now(),
        });
        await journal.recordBackup({
          path: backup.path,
          checksum: backup.checksum,
          revision: input.baseline.draft.revision,
        });
        await journal.advance('BACKED_UP', { path: backup.path });
      }

      const writer = this.createWriteGateway({
        fence: lock,
        plan,
        planInput: input,
        intent,
        backup,
      });

      const mediaIds: Record<string, string> = {};
      for (const mediaPlan of plan.media) {
        const definition = manifest.media.find(
          (asset) => asset.key === mediaPlan.key,
        );
        if (!definition) {
          throw new Error(`Manifest media ${mediaPlan.key} is missing.`);
        }
        await lock.assertHeld();
        let started = false;
        try {
          const mediaIdentity = await writer.mediaStorageIdentity(
            definition.key,
          );
          await journal.advance(
            'MEDIA_UPLOAD_STARTED',
            {
              key: definition.key,
              path: mediaPlan.path,
              sha256: mediaPlan.sha256,
              action: mediaIdentity.action,
              storageKey: mediaIdentity.storageKey,
              thumbnailKey: mediaIdentity.thumbnailKey,
            },
            `MEDIA_UPLOAD_STARTED:${definition.key}`,
          );
          started = true;
          const result = await writer.uploadOrReuseMedia(definition.key);
          if (result.storageAction === 'reused-verified-orphan') {
            await journal.advance(
              'MEDIA_ORPHAN_VERIFIED',
              {
                key: definition.key,
                id: result.id,
                storageKey: result.storageKey,
                thumbnailKey: result.thumbnailKey,
                sha256: mediaPlan.sha256,
              },
              `MEDIA_ORPHAN_VERIFIED:${definition.key}`,
            );
          }
          mediaIds[definition.key] = result.id;
          await journal.advance(
            'MEDIA_WRITTEN',
            {
              key: definition.key,
              id: result.id,
              action: result.action,
              storageAction: result.storageAction,
              storageKey: result.storageKey,
              thumbnailKey: result.thumbnailKey,
            },
            `MEDIA_WRITTEN:${definition.key}`,
          );
        } catch (error) {
          if (error instanceof MediaStorageConflictError) {
            try {
              if (!started) {
                await journal.advance(
                  'MEDIA_UPLOAD_STARTED',
                  {
                    key: definition.key,
                    path: mediaPlan.path,
                    sha256: mediaPlan.sha256,
                    action: 'provenance-failed',
                  },
                  `MEDIA_UPLOAD_STARTED:${definition.key}`,
                );
              }
              await journal.advance(
                'MEDIA_CONFLICT',
                {
                  key: definition.key,
                  storageKey: error.key,
                  sha256: mediaPlan.sha256,
                  reason: error.message,
                },
                `MEDIA_CONFLICT:${definition.key}`,
              );
            } catch {
              // Preserve the original conflict; the journal may already be
              // unreachable because the lease was lost.
            }
          }
          throw error;
        }
      }
      await journal.advance('MEDIA_READY', {
        count: Object.keys(mediaIds).length,
      });

      const campaignIds: Record<string, string> = {};
      for (const campaignPlan of plan.campaigns) {
        const definition = manifest.campaigns.find(
          (campaign) => campaign.key === campaignPlan.key,
        );
        if (!definition) {
          throw new Error(`Manifest campaign ${campaignPlan.key} is missing.`);
        }
        await lock.assertHeld();
        await journal.advance(
          'CAMPAIGN_WRITE_STARTED',
          { key: definition.key },
          `CAMPAIGN_WRITE_STARTED:${definition.key}`,
        );
        const result = await writer.upsertCampaign(definition.key);
        campaignIds[definition.key] = result.id;
        await journal.advance(
          'CAMPAIGN_WRITTEN',
          {
            key: definition.key,
            id: result.id,
            action: result.action,
          },
          `CAMPAIGN_WRITTEN:${definition.key}`,
        );
      }
      await journal.advance('CAMPAIGNS_READY', {
        count: Object.keys(campaignIds).length,
      });

      const blogPostIds: Record<string, string> = {};
      for (const blogPlan of plan.blog) {
        const definition = manifest.blog.find(
          (article) => article.key === blogPlan.key,
        );
        if (!definition) {
          throw new Error(`Manifest blog article ${blogPlan.key} is missing.`);
        }
        await lock.assertHeld();
        await journal.advance(
          'BLOG_DRAFT_STARTED',
          { key: definition.key },
          `BLOG_DRAFT_STARTED:${definition.key}`,
        );
        const result = await writer.upsertBlogPost(definition.key);
        blogPostIds[definition.key] = result.id;
        await journal.advance(
          'BLOG_DRAFT_WRITTEN',
          {
            key: definition.key,
            id: result.id,
            action: result.action,
          },
          `BLOG_DRAFT_WRITTEN:${definition.key}`,
        );
      }
      await journal.advance('BLOG_DRAFTS_READY', {
        count: Object.keys(blogPostIds).length,
      });

      await lock.assertHeld();
      const draft = await writer.applyDraftAndPublication();

      return {
        operationId,
        plan,
        backup,
        campaigns: campaignIds,
        media: mediaIds,
        blog: blogPostIds,
        draft,
        replayed: false,
      };
    } catch (error) {
      if (
        journal !== null &&
        !(error instanceof MediaStorageConflictError)
      ) {
        try {
          await journal.fail(
            error instanceof Error ? error.message : String(error),
          );
        } catch {
          // The lease remains the fallback; do not mask the original error.
        }
      }
      throw error;
    } finally {
      await lock.release();
    }
  }
}
