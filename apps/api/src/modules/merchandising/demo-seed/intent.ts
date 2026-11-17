import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { canonicalJson } from './backup';
import type {
  DatabaseIdentity,
  DemoSeedBaselineIntent,
  DemoSeedIntentPayload,
  DemoSeedManifest,
  DemoSeedOptions,
  DemoSeedPlan,
  DemoSeedPlanInput,
} from './types';

export interface DemoSeedAssetIntent {
  key: string;
  fileName: string;
  mimeType: string;
  slot: string;
  exists: boolean;
  sizeBytes: number | null;
  sha256: string | null;
  error: string | null;
}

export interface DemoSeedIntent {
  version: 1;
  operationId: string;
  identityFingerprint: string;
  manifestHash: string;
  planHash: string;
  intentHash: string;
  baselineHash: string;
  publicationMode: 'draft' | 'publish';
  assets: DemoSeedAssetIntent[];
  mediaAckIds: string[];
  payload: DemoSeedIntentPayload;
  baseline: DemoSeedBaselineIntent;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function computeManifestHash(manifest: DemoSeedManifest): string {
  return sha256(manifest);
}

export function computeAssetsIntent(
  input: DemoSeedPlanInput,
): DemoSeedAssetIntent[] {
  return input.manifest.media
    .map((asset) => {
      const state = input.assets[asset.key];
      return {
        key: asset.key,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        slot: asset.slot,
        exists: state?.exists ?? false,
        sizeBytes: state?.sizeBytes ?? null,
        sha256: state?.sha256 ?? null,
        error: state?.error ?? 'Asset state is missing from the plan.',
      };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Plan identity covers immutable approved content, database identity and asset
 * bytes. Mutable baseline rows (draft revision, current publication, resolved
 * catalog IDs) are deliberately excluded; they are rechecked transactionally.
 */
export function computePlanHash(input: {
  manifestHash: string;
  identityFingerprint: string;
  assets: DemoSeedAssetIntent[];
  publicationMode: 'draft' | 'publish';
  mediaAckIds: string[];
}): string {
  return sha256({
    version: 1,
    manifestHash: input.manifestHash,
    identityFingerprint: input.identityFingerprint,
    assets: input.assets,
    publicationMode: input.publicationMode,
    mediaAckIds: [...new Set(input.mediaAckIds)].sort(),
  });
}

export function buildDemoSeedBaselineIntent(
  input: DemoSeedPlanInput,
  plan: DemoSeedPlan,
): DemoSeedBaselineIntent {
  return {
    draft: input.baseline.draft,
    publications: input.baseline.publications,
    candidates: {
      products: input.candidates.products.map((product) => product.id),
      categories: input.candidates.categories.map((category) => ({
        id: category.id,
        slug: category.slug,
        publishedProductCount: category.publishedProductCount,
      })),
      brands: input.candidates.brands.map((brand) => ({
        id: brand.id,
        slug: brand.slug,
        publishedProductCount: brand.publishedProductCount,
      })),
      productsByBrand: Object.fromEntries(
        Object.entries(input.candidates.productsByBrand).map(
          ([brandSlug, products]) => [
            brandSlug,
            products.map((product) => product.id),
          ],
        ),
      ),
    },
    campaignPayloads: plan.campaigns.map((campaign) => ({
      key: campaign.key,
      internalName: campaign.internalName,
      payload: campaign.payload,
    })),
    sections: plan.sections,
    spotlightCategoryId: plan.candidates.categories[0]?.id ?? null,
    mediaReconciliation: {
      affectedIds: plan.mediaReconciliation.affected.map((row) => row.id),
      acknowledgedIds: plan.mediaReconciliation.acknowledgedIds,
      matchesAck: plan.mediaReconciliation.matchesAck,
    },
    publication: plan.publication,
    draftPlan: plan.draft,
    publicApiBaseUrl: plan.publicApiBaseUrl,
  };
}

export function buildDemoSeedIntent(input: {
  operationId: string;
  identity: DatabaseIdentity;
  manifest: DemoSeedManifest;
  assets: DemoSeedAssetIntent[];
  plan: DemoSeedPlan;
  input: DemoSeedPlanInput;
  options: Pick<
    DemoSeedOptions,
    | 'mediaReconciliationAckIds'
    | 'replaceDraft'
    | 'publish'
    | 'acknowledgePublicationReplacement'
    | 'publicApiBaseUrl'
  >;
}): DemoSeedIntent {
  const manifestHash = computeManifestHash(input.manifest);
  const rawAckIds = input.options.mediaReconciliationAckIds;
  if (new Set(rawAckIds).size !== rawAckIds.length) {
    throw new Error(
      'HOMEPAGE_DEMO_MEDIA_ACK_IDS must not contain duplicate media ids.',
    );
  }
  const mediaAckIds = [...rawAckIds].sort();
  const publicationMode = input.options.publish ? 'publish' : 'draft';
  const planHash = computePlanHash({
    manifestHash,
    identityFingerprint: input.identity.fingerprint,
    assets: input.assets,
    publicationMode,
    mediaAckIds,
  });
  const payload: DemoSeedIntentPayload = {
    version: 1,
    operationId: input.operationId,
    identity: input.identity,
    manifestHash,
    planHash,
    publicationMode,
    assets: input.assets,
    mediaReconciliationAckIds: mediaAckIds,
    replaceDraft: input.options.replaceDraft,
    publish: input.options.publish,
    acknowledgePublicationReplacement:
      input.options.acknowledgePublicationReplacement,
    publicApiBaseUrl: input.options.publicApiBaseUrl,
    manifest: input.manifest,
  };
  const baseline = buildDemoSeedBaselineIntent(input.input, input.plan);
  return {
    version: 1,
    operationId: input.operationId,
    identityFingerprint: input.identity.fingerprint,
    manifestHash,
    planHash,
    intentHash: sha256(payload),
    baselineHash: sha256(baseline),
    publicationMode,
    assets: input.assets,
    mediaAckIds,
    payload,
    baseline,
  };
}

export function intentPayloadAsJson(
  intent: DemoSeedIntent,
): Prisma.InputJsonValue {
  return intent.payload as unknown as Prisma.InputJsonValue;
}
