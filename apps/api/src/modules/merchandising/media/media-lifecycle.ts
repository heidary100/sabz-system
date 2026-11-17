/**
 * Publication lifecycle contracts for merchandising media (Task 05.2 / 05.4).
 *
 * A `MerchMedia.publishedAt` value is the only public-delivery gate. Attaching
 * media to a campaign or draft must never set it by itself. Immediate homepage
 * publication (Task 05.4) sets/clears it inside the same lifecycle transaction;
 * Task 05.6 scheduled activation must reuse the same protocol.
 *
 * Lock protocol (see `../lifecycle-locks.ts`):
 * - campaign lifecycle lock is acquired before this media lock;
 * - never acquire the campaign lock while already holding the media lock;
 * - deletion uses this lock and runs in the transaction that checks
 *   campaign/publication references.
 */
export const MERCH_MEDIA_LIFECYCLE_LOCK_KEY = 'merchandising-media-lifecycle';

/** Acquire the media lifecycle advisory lock inside the caller's transaction. */
export async function lockMediaLifecycle(
  tx: import('@prisma/client').Prisma.TransactionClient,
): Promise<void> {
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    MERCH_MEDIA_LIFECYCLE_LOCK_KEY,
  );
}

function collectMediaIdsInto(value: unknown, ids: Set<string>): void {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }
    if (typeof current !== 'object' || current === null) {
      continue;
    }
    const record = current as Record<string, unknown>;
    if (typeof record.mediaId === 'string') {
      ids.add(record.mediaId);
    }
    for (const item of Object.values(record)) {
      stack.push(item);
    }
  }
}

/**
 * Extracts every `mediaId` from an immutable publication snapshot without
 * assuming a specific section type. Uses an iterative walk so malformed or
 * deeply nested admin JSON cannot cause a stack overflow.
 *
 * This is the reference-integrity scan: it intentionally includes hidden
 * sections so media deletion cannot silently break a stored snapshot.
 */
export function collectMediaIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  collectMediaIdsInto(value, ids);
  return ids;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extracts `mediaId` values from visible snapshot sections only.
 *
 * Public publication eligibility is based on visible sections. Media referenced
 * exclusively by hidden sections must remain unpublished; media shared by a
 * visible and a hidden section is included because the visible reference is the
 * authoritative one.
 */
export function collectVisibleMediaIds(snapshot: unknown): Set<string> {
  const ids = new Set<string>();
  const sections = Array.isArray(snapshot)
    ? snapshot
    : isRecord(snapshot) && Array.isArray(snapshot.sections)
      ? snapshot.sections
      : [];
  for (const section of sections) {
    if (!isRecord(section) || section.isVisible !== true) {
      continue;
    }
    collectMediaIdsInto(section, ids);
  }
  return ids;
}

export function snapshotReferencesMedia(
  snapshot: unknown,
  mediaId: string,
): boolean {
  return collectMediaIds(snapshot).has(mediaId);
}
