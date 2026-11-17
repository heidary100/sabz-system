import {
  buildDemoSeedBaselineIntent,
  buildDemoSeedIntent,
  computeAssetsIntent,
  computeManifestHash,
  computePlanHash,
} from './intent';
import { buildDemoSeedPlan } from './planner';
import { approvedManifest, options, planInput } from './test-fixtures';

function intentFor(overrides: {
  operationId?: string;
  assetSha?: string;
  ackIds?: string[];
  publish?: boolean;
} = {}) {
  const input = planInput(approvedManifest());
  if (overrides.assetSha) {
    for (const asset of input.manifest.media) {
      input.assets[asset.key] = {
        ...input.assets[asset.key]!,
        sha256: overrides.assetSha,
      };
    }
  }
  const assets = computeAssetsIntent(input);
  const plan = buildDemoSeedPlan(input);
  return buildDemoSeedIntent({
    operationId: overrides.operationId ?? 'operation-1',
    identity: input.identity,
    manifest: input.manifest,
    assets,
    plan,
    input,
    options: options({
      operationId: overrides.operationId ?? 'operation-1',
      mediaReconciliationAckIds: overrides.ackIds ?? [],
      publish: overrides.publish ?? true,
      acknowledgePublicationReplacement: true,
    }),
  });
}

describe('homepage demo seed immutable intent', () => {
  it('is stable for identical content, identity, assets and options', () => {
    const first = intentFor();
    const second = intentFor();
    expect(first.intentHash).toBe(second.intentHash);
    expect(first.planHash).toBe(second.planHash);
    expect(first.manifestHash).toBe(computeManifestHash(approvedManifest()));
  });

  it('changes when the operation id changes', () => {
    expect(intentFor({ operationId: 'operation-2' }).intentHash).not.toBe(
      intentFor().intentHash,
    );
  });

  it('changes when an asset hash changes', () => {
    expect(intentFor({ assetSha: 'b'.repeat(64) }).intentHash).not.toBe(
      intentFor().intentHash,
    );
    expect(intentFor({ assetSha: 'b'.repeat(64) }).planHash).not.toBe(
      intentFor().planHash,
    );
  });

  it('changes when the media acknowledgement or publication mode changes', () => {
    expect(intentFor({ ackIds: ['media-a'] }).intentHash).not.toBe(
      intentFor().intentHash,
    );
    expect(intentFor({ publish: false }).intentHash).not.toBe(
      intentFor().intentHash,
    );
  });

  it('rejects duplicate media acknowledgement ids', () => {
    expect(() => intentFor({ ackIds: ['media-a', 'media-a'] })).toThrow(
      /must not contain duplicate/,
    );
  });

  it('excludes mutable baseline state from content plan identity but binds it separately', () => {
    const input = planInput(approvedManifest());
    const assets = computeAssetsIntent(input);
    const base = {
      manifestHash: computeManifestHash(input.manifest),
      identityFingerprint: input.identity.fingerprint,
      assets,
      publicationMode: 'publish' as const,
      mediaAckIds: [],
    };
    const firstPlanHash = computePlanHash(base);
    const firstBaseline = buildDemoSeedBaselineIntent(
      input,
      buildDemoSeedPlan(input),
    );
    input.baseline.draft = { ...input.baseline.draft!, revision: 99 };
    input.baseline.publications = [];
    const secondBaseline = buildDemoSeedBaselineIntent(
      input,
      buildDemoSeedPlan(input),
    );
    expect(computePlanHash(base)).toBe(firstPlanHash);
    expect(secondBaseline).not.toEqual(firstBaseline);
  });

  it('binds selected candidates, spotlight, publications and draft revision', () => {
    const input = planInput(approvedManifest());
    const first = buildDemoSeedBaselineIntent(
      input,
      buildDemoSeedPlan(input),
    );
    const spotlightCampaign = first.campaignPayloads.find(
      (campaign) => campaign.key === 'spotlight',
    );
    expect(first.spotlightCategoryId).not.toBeNull();
    expect(spotlightCampaign?.payload.categoryIds).toContain(
      first.spotlightCategoryId,
    );
    const changedCandidates = planInput(approvedManifest(), {
      candidates: {
        ...input.candidates,
        categories: [input.candidates.categories[1]!, ...input.candidates.categories.slice(0, 1)],
      },
    });
    const second = buildDemoSeedBaselineIntent(
      changedCandidates,
      buildDemoSeedPlan(changedCandidates),
    );
    expect(second.spotlightCategoryId).not.toBe(first.spotlightCategoryId);
    expect(second).not.toEqual(first);

    const changedDraft = planInput(approvedManifest(), {
      baseline: {
        ...input.baseline,
        draft: { ...input.baseline.draft!, revision: 42 },
      },
    });
    const third = buildDemoSeedBaselineIntent(
      changedDraft,
      buildDemoSeedPlan(changedDraft),
    );
    expect(third.draft?.revision).toBe(42);
    expect(third).not.toEqual(first);
  });
});
