import {
  assertApprovedManifest,
  assertAuthorizationBindings,
  computeSectionsHash,
  hashJson,
  type DemoSeedWriteAuthorization,
} from './authorization';
import { approvedManifest, manifestWithPending } from './test-fixtures';
import type { HomepageDraftSection } from '@sabz/types';
import * as authorizationModule from './authorization';
import * as writeGatewayModule from './write-gateway';

function sections(): HomepageDraftSection[] {
  return [
    {
      key: 'trust',
      type: 'TRUST_STRIP',
      order: 1,
      isVisible: true,
      settings: { items: [] },
    },
  ] as HomepageDraftSection[];
}

function authorization(
  overrides: Partial<DemoSeedWriteAuthorization> = {},
): DemoSeedWriteAuthorization {
  const value = sections();
  return {
    operationId: 'operation-1',
    intentHash: 'intent-hash',
    planHash: 'plan-hash',
    identityFingerprint: 'identity-fingerprint',
    manifestHash: 'manifest-hash',
    assetsHash: 'assets-hash',
    publicationMode: 'publish',
    acknowledgedMediaIds: ['media-a', 'media-b'],
    expectedRevision: 3,
    expectedPublishedVersions: [2, 3],
    expectedAffectedMediaIds: ['media-c'],
    newSnapshotMediaIds: ['media-a', 'media-b'],
    blogPostIds: ['blog-a'],
    sections: value,
    sectionsHash: computeSectionsHash(value),
    campaignIds: { hero: 'campaign-a' },
    mediaIds: { hero: 'media-a' },
    blogIds: { article: 'blog-a' },
    ...overrides,
  };
}

function expected(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'operation-1',
    intentHash: 'intent-hash',
    planHash: 'plan-hash',
    identityFingerprint: 'identity-fingerprint',
    manifestHash: 'manifest-hash',
    assetsHash: 'assets-hash',
    publicationMode: 'publish',
    acknowledgedMediaIds: ['media-b', 'media-a'],
    expectedRevision: 3,
    expectedPublishedVersions: [3, 2],
    expectedAffectedMediaIds: ['media-c'],
    newSnapshotMediaIds: ['media-b', 'media-a'],
    blogPostIds: ['blog-a'],
    sectionsHash: computeSectionsHash(sections()),
    ...overrides,
  } as Parameters<typeof assertAuthorizationBindings>[1];
}

describe('homepage demo seed write authorization', () => {
  it('has no exported capability issuer or writer constructor', () => {
    expect(
      (authorizationModule as Record<string, unknown>).issueWriteAuthorization,
    ).toBeUndefined();
    expect(
      (authorizationModule as Record<string, unknown>)
        .assertWriteAuthorization,
    ).toBeUndefined();
    expect(
      (writeGatewayModule as Record<string, unknown>).PrismaDemoSeedWriteGateway,
    ).toBeUndefined();
  });

  it('accepts bindings derived from the same sealed plan', () => {
    expect(() =>
      assertAuthorizationBindings(authorization(), expected()),
    ).not.toThrow();
  });

  it('rejects a different plan hash, identity, asset set or media acknowledgement', () => {
    expect(() =>
      assertAuthorizationBindings(
        authorization(),
        expected({ planHash: 'other-plan' }),
      ),
    ).toThrow(/planHash/);
    expect(() =>
      assertAuthorizationBindings(
        authorization(),
        expected({ identityFingerprint: 'other-identity' }),
      ),
    ).toThrow(/identityFingerprint/);
    expect(() =>
      assertAuthorizationBindings(
        authorization(),
        expected({ assetsHash: 'other-assets' }),
      ),
    ).toThrow(/assetsHash/);
    expect(() =>
      assertAuthorizationBindings(
        authorization(),
        expected({ acknowledgedMediaIds: ['media-a'] }),
      ),
    ).toThrow(/acknowledgement/);
    expect(() =>
      assertAuthorizationBindings(
        authorization(),
        expected({ blogPostIds: ['blog-b'] }),
      ),
    ).toThrow(/blog set/);
    expect(() =>
      assertAuthorizationBindings(
        authorization(),
        expected({ sectionsHash: hashJson([]) }),
      ),
    ).toThrow(/sectionsHash/);
  });

  it('rejects substituted sections even when the caller supplies their hash', () => {
    const replaced = [
      {
        key: 'hero',
        type: 'TRUST_STRIP',
        order: 1,
        isVisible: true,
        settings: { items: [{ icon: 'TRUCK', title: 'replaced' }] },
      },
    ] as unknown as HomepageDraftSection[];
    expect(() =>
      assertAuthorizationBindings(
        authorization({
          sections: replaced,
          sectionsHash: computeSectionsHash(replaced),
        }),
        expected({ sectionsHash: computeSectionsHash(sections()) }),
      ),
    ).toThrow(/sectionsHash/);
  });

  it('rejects pending approvals and placeholder content', () => {
    expect(() =>
      assertApprovedManifest(manifestWithPending(['trust_claims'])),
    ).toThrow(/unapproved/);
    expect(() => assertApprovedManifest(approvedManifest())).not.toThrow();
  });
});
