import { Prisma } from '@prisma/client';

/** Serializes campaign archive with future publication snapshot creation. */
export const MERCH_CAMPAIGN_LIFECYCLE_LOCK_KEY = 'merch:campaign:lifecycle';

const CAMPAIGN_EDIT_LOCK_PREFIX = 'merch:campaign:edit';

/**
 * Serialize all mutations of one campaign. Concurrent PATCH requests then see
 * each other's committed state instead of interleaving ordered-association
 * replacement. No schema revision column is introduced for Task 05.3.
 */
export async function lockCampaignEdit(
  tx: Prisma.TransactionClient,
  campaignId: string,
): Promise<void> {
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    `${CAMPAIGN_EDIT_LOCK_PREFIX}:${campaignId}`,
  );
}

/**
 * Global merchandising lifecycle lock. Archive takes it before checking usage so
 * a future publication service can serialize snapshot creation with archive
 * using the same key. Never hold it across unrelated slow work.
 */
export async function lockCampaignLifecycle(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    MERCH_CAMPAIGN_LIFECYCLE_LOCK_KEY,
  );
}
