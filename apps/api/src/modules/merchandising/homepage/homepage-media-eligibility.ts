import { Prisma } from '@prisma/client';
import type { HomepageSnapshot } from '@sabz/types';
import { collectVisibleMediaIds } from '../media/media-lifecycle';

/**
 * Reconcile `MerchMedia.publishedAt` with the media referenced by visible
 * sections of the current PUBLISHED homepage snapshot. Hidden-section-only
 * media remains unpublished; shared visible/hidden media stays published.
 * Call only inside the publication lifecycle transaction that holds the
 * campaign-then-media advisory locks.
 *
 * Immediate publication and rollback use this now. Task 05.6 scheduled
 * activation must call the same helper when a SCHEDULED snapshot becomes
 * PUBLISHED; scheduled creation itself must not call it.
 */
export async function reconcilePublishedMediaEligibility(
  tx: Prisma.TransactionClient,
  snapshot: HomepageSnapshot,
  publishedAt: Date,
  actorId: string,
): Promise<void> {
  const ids = [...collectVisibleMediaIds(snapshot)];
  if (ids.length > 0) {
    await tx.merchMedia.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { publishedAt, updatedBy: actorId },
    });
  }
  await tx.merchMedia.updateMany({
    where: {
      publishedAt: { not: null },
      ...(ids.length > 0 ? { id: { notIn: ids } } : {}),
    },
    data: { publishedAt: null, updatedBy: actorId },
  });
}
