import { Prisma } from '@prisma/client';
import {
  lockCampaignEdit,
  lockCampaignLifecycle,
  MERCH_CAMPAIGN_LIFECYCLE_LOCK_KEY,
} from './campaigns/campaign-lifecycle';
import {
  lockMediaLifecycle,
  MERCH_MEDIA_LIFECYCLE_LOCK_KEY,
} from './media/media-lifecycle';

/**
 * Cross-domain merchandising lifecycle lock protocol (Task 05.4).
 *
 * Advisory locks are PostgreSQL transaction-scoped. They must be acquired only
 * through these helpers and only inside the transaction that performs the
 * protected reads and writes.
 *
 * Deterministic global order:
 *   1. campaign lifecycle lock
 *   2. media lifecycle lock
 *
 * Never acquire the campaign lifecycle lock while already holding the media
 * lock. Per-campaign edit locks sit between the two globals when an operation
 * needs them (campaign global -> campaign edit -> media). No operation may
 * acquire the campaign global after any media lock.
 *
 * Participating operations:
 * - homepage publication snapshot creation/rollback: campaign global, then
 *   media; draft row lock is acquired after both.
 * - campaign update/enable/disable: campaign global, campaign edit, and media
 *   only when the request changes media assignments.
 * - campaign archive: campaign global, then campaign edit.
 * - media soft-delete and metadata update: media lock only.
 *
 * This means publication creation cannot race campaign archival/source edits or
 * media deletion, and campaign media assignment cannot race media deletion.
 */
export async function lockHomepagePublicationSources(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await lockCampaignLifecycle(tx);
  await lockMediaLifecycle(tx);
}

export {
  lockCampaignEdit,
  lockCampaignLifecycle,
  lockMediaLifecycle,
  MERCH_CAMPAIGN_LIFECYCLE_LOCK_KEY,
  MERCH_MEDIA_LIFECYCLE_LOCK_KEY,
};
