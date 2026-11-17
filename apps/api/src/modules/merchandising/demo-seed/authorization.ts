import { createHash } from 'crypto';
import type { HomepageDraftSection } from '@sabz/types';
import { canonicalJson } from './backup';
import { validateManifestContent } from './content-validation';
import type { DemoSeedManifest } from './types';

/**
 * Sealed input for the one final draft/publication transaction. It is created
 * and verified inside `write-gateway.ts`; there is no exported issuer and no
 * caller-supplied sections or media IDs at this boundary.
 */
export interface DemoSeedWriteAuthorization {
  readonly operationId: string;
  readonly intentHash: string;
  readonly planHash: string;
  readonly identityFingerprint: string;
  readonly manifestHash: string;
  readonly assetsHash: string;
  readonly publicationMode: 'draft' | 'publish';
  readonly acknowledgedMediaIds: readonly string[];
  readonly expectedRevision: number | null;
  readonly expectedPublishedVersions: readonly number[];
  readonly expectedAffectedMediaIds: readonly string[];
  readonly newSnapshotMediaIds: readonly string[];
  readonly blogPostIds: readonly string[];
  readonly sections: readonly HomepageDraftSection[];
  readonly sectionsHash: string;
  readonly campaignIds: Readonly<Record<string, string>>;
  readonly mediaIds: Readonly<Record<string, string>>;
  readonly blogIds: Readonly<Record<string, string>>;
}

export function hashJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function computeSectionsHash(sections: readonly HomepageDraftSection[]): string {
  return hashJson(sections);
}

export function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

export function sameIdSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function assertApprovedManifest(manifest: DemoSeedManifest): void {
  const pending = Object.values(manifest.approvals).filter(
    (approval) => !approval.approved,
  );
  if (pending.length > 0) {
    throw new Error(
      `The final mutation boundary received an unapproved manifest (${pending
        .map((approval) => approval.key)
        .join(', ')}).`,
    );
  }
  if (validateManifestContent(manifest).length > 0) {
    throw new Error(
      'The final mutation boundary received incomplete or placeholder content.',
    );
  }
}

export interface ExpectedAuthorizationBindings {
  operationId: string;
  intentHash: string;
  planHash: string;
  identityFingerprint: string;
  manifestHash: string;
  assetsHash: string;
  publicationMode: 'draft' | 'publish';
  acknowledgedMediaIds: readonly string[];
  expectedRevision: number | null;
  expectedPublishedVersions: readonly number[];
  expectedAffectedMediaIds: readonly string[];
  newSnapshotMediaIds: readonly string[];
  blogPostIds: readonly string[];
  sectionsHash: string;
}

function sameNumberSet(
  left: readonly number[],
  right: readonly number[],
): boolean {
  const a = [...left].sort((x, y) => x - y);
  const b = [...right].sort((x, y) => x - y);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Revalidates every binding that the final transaction depends on. The values
 * are re-derived from the sealed plan inside the same module that created the
 * authorization; a caller cannot substitute sections, IDs or acknowledgement.
 */
export function assertAuthorizationBindings(
  authorization: DemoSeedWriteAuthorization,
  expected: ExpectedAuthorizationBindings,
): void {
  const checks: Array<[string, unknown, unknown]> = [
    ['operationId', authorization.operationId, expected.operationId],
    ['intentHash', authorization.intentHash, expected.intentHash],
    ['planHash', authorization.planHash, expected.planHash],
    [
      'identityFingerprint',
      authorization.identityFingerprint,
      expected.identityFingerprint,
    ],
    ['manifestHash', authorization.manifestHash, expected.manifestHash],
    ['assetsHash', authorization.assetsHash, expected.assetsHash],
    ['publicationMode', authorization.publicationMode, expected.publicationMode],
    ['expectedRevision', authorization.expectedRevision, expected.expectedRevision],
    ['sectionsHash', authorization.sectionsHash, expected.sectionsHash],
  ];
  for (const [name, actual, wanted] of checks) {
    if (actual !== wanted) {
      throw new Error(
        `Homepage demo seed write authorization ${name} does not match the sealed plan.`,
      );
    }
  }
  if (!sameIdSet(authorization.acknowledgedMediaIds, expected.acknowledgedMediaIds)) {
    throw new Error(
      'Homepage demo seed write authorization media acknowledgement does not match the approved plan.',
    );
  }
  if (
    !sameIdSet(
      authorization.expectedAffectedMediaIds,
      expected.expectedAffectedMediaIds,
    )
  ) {
    throw new Error(
      'Homepage demo seed write authorization affected-media set does not match the approved plan.',
    );
  }
  if (!sameIdSet(authorization.newSnapshotMediaIds, expected.newSnapshotMediaIds)) {
    throw new Error(
      'Homepage demo seed write authorization snapshot media set does not match the approved plan.',
    );
  }
  if (!sameIdSet(authorization.blogPostIds, expected.blogPostIds)) {
    throw new Error(
      'Homepage demo seed write authorization blog set does not match the approved plan.',
    );
  }
  if (
    !sameNumberSet(
      authorization.expectedPublishedVersions,
      expected.expectedPublishedVersions,
    )
  ) {
    throw new Error(
      'Homepage demo seed write authorization publication versions do not match the approved plan.',
    );
  }
}
