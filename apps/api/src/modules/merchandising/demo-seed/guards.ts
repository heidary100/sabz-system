/**
 * Pure apply-time guards. Keeping these independent of Prisma makes the
 * concurrency contract testable without a database.
 */

export function assertDraftState(input: {
  expectedRevision: number | null;
  currentRevision: number;
  currentSectionCount: number;
  replaceDraft: boolean;
}): void {
  if (input.expectedRevision !== null && !input.replaceDraft) {
    throw new Error('Draft replacement was not explicitly authorized.');
  }
  if (input.expectedRevision === null) {
    if (input.currentRevision !== 0 || input.currentSectionCount > 0) {
      throw new Error(
        'A homepage draft appeared after planning; refusing to overwrite it.',
      );
    }
    return;
  }
  if (input.currentRevision !== input.expectedRevision) {
    throw new Error(
      `Draft revision changed after planning: expected ${input.expectedRevision}, found ${input.currentRevision}.`,
    );
  }
}

export function assertPublishedState(
  expectedVersions: number[],
  currentVersions: number[],
): void {
  const expected = [...expectedVersions].sort((a, b) => a - b);
  const current = [...currentVersions].sort((a, b) => a - b);
  if (
    expected.length !== current.length ||
    expected.some((version, index) => version !== current[index])
  ) {
    throw new Error(
      `Published homepage state changed after planning: expected versions [${expected.join(', ')}], found [${current.join(', ')}].`,
    );
  }
}

export function assertPublicationAcknowledgement(input: {
  publish: boolean;
  expectedPublishedVersions: number[];
  acknowledged: boolean;
}): void {
  if (
    input.publish &&
    input.expectedPublishedVersions.length > 0 &&
    !input.acknowledged
  ) {
    throw new Error('Publication replacement was not acknowledged.');
  }
}

export interface PublishedBlogSnapshot {
  title: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  authorName: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  categoryId: string | null;
}

/**
 * Existing published demo articles are never mutated before the final
 * publication transaction. If the manifest differs at all, the operator must
 * use a separately reviewed unpublish/republish workflow.
 */
export function assertPublishedBlogUnchanged(input: {
  slug: string;
  existing: PublishedBlogSnapshot;
  desired: PublishedBlogSnapshot;
}): void {
  const { existing, desired } = input;
  if (
    existing.title !== desired.title ||
    existing.excerpt !== desired.excerpt ||
    existing.content !== desired.content ||
    existing.coverImageUrl !== desired.coverImageUrl ||
    existing.authorName !== desired.authorName ||
    existing.metaTitle !== desired.metaTitle ||
    existing.metaDescription !== desired.metaDescription ||
    existing.categoryId !== desired.categoryId
  ) {
    throw new Error(
      `Published demo blog post ${input.slug} differs from the manifest. Refusing to change public content before the final publication transaction. Use a separately reviewed unpublish/republish workflow.`,
    );
  }
}

export function assertFinalBlogContentUnchanged(input: {
  slug: string;
  existing: PublishedBlogSnapshot;
  desired: PublishedBlogSnapshot;
}): void {
  const { existing, desired } = input;
  if (
    existing.title !== desired.title ||
    existing.excerpt !== desired.excerpt ||
    existing.content !== desired.content ||
    existing.coverImageUrl !== desired.coverImageUrl ||
    existing.authorName !== desired.authorName ||
    existing.metaTitle !== desired.metaTitle ||
    existing.metaDescription !== desired.metaDescription ||
    existing.categoryId !== desired.categoryId
  ) {
    throw new Error(
      `Demo blog post ${input.slug} changed after planning. Refusing final publication so unpublished or unapproved content cannot become public.`,
    );
  }
}

function sameIdSet(left: string[], right: string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function hasDuplicateIds(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}

/**
 * Publication reconciliation is authorized only for the exact media IDs shown
 * in the plan and acknowledged by the operator. Any concurrent change aborts.
 */
export function assertMediaReconciliation(input: {
  expectedAffectedIds: string[];
  actualAffectedIds: string[];
  acknowledgedIds: string[];
}): void {
  if (
    hasDuplicateIds(input.expectedAffectedIds) ||
    hasDuplicateIds(input.actualAffectedIds) ||
    hasDuplicateIds(input.acknowledgedIds)
  ) {
    throw new Error(
      'Media reconciliation identifiers must be unique; duplicate IDs are not accepted.',
    );
  }
  if (!sameIdSet(input.expectedAffectedIds, input.actualAffectedIds)) {
    throw new Error(
      `Media reconciliation affected set changed: expected [${[...new Set(input.expectedAffectedIds)].sort().join(', ')}], found [${[...new Set(input.actualAffectedIds)].sort().join(', ')}].`,
    );
  }
  if (!sameIdSet(input.actualAffectedIds, input.acknowledgedIds)) {
    throw new Error(
      'Media reconciliation acknowledgement does not match the exact affected media set.',
    );
  }
}
