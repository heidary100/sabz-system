import type { Prisma } from '@prisma/client';
import { DEMO_LOCK_ID, DEMO_LOCK_LEASE_MS } from './constants';

export class DemoSeedFenceLostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoSeedFenceLostError';
  }
}

export interface DemoSeedFenceIdentity {
  readonly ownerToken: string;
  readonly generation: number;
  readonly operationId: string;
}

/**
 * A fenced writer must call `lockWithinTransaction` before its first protected
 * mutation. The lock row remains locked until the transaction commits, so a
 * competing acquisition cannot install a newer generation while a protected
 * transaction is still in flight.
 */
export interface DemoSeedFence extends DemoSeedFenceIdentity {
  lockWithinTransaction(tx: Prisma.TransactionClient): Promise<void>;
}

interface LockRow {
  ownerToken: string | null;
  fencingGeneration: number;
  leaseExpiresAt: Date | null;
  operationId: string | null;
}

function leaseSeconds(): number {
  return DEMO_LOCK_LEASE_MS / 1000;
}

/**
 * Couples a protected mutation to the lease generation.
 *
 * 1. `SELECT ... FOR UPDATE` blocks competing acquisitions for the life of the
 *    surrounding transaction.
 * 2. The owner token and monotonic generation are checked after the row lock.
 * 3. Liveness is checked with `clock_timestamp()` (statement time), not the
 *    transaction-start `now()` value.
 * 4. A still-live lease is renewed in the same statement.
 */
export async function lockDemoSeedFence(
  tx: Prisma.TransactionClient,
  fence: DemoSeedFenceIdentity,
): Promise<void> {
  const rows = await tx.$queryRaw<LockRow[]>`
    SELECT "ownerToken", "fencingGeneration", "leaseExpiresAt", "operationId"
    FROM "HomepageDemoSeedLock"
    WHERE "id" = ${DEMO_LOCK_ID}
    FOR UPDATE
  `;
  if (rows.length !== 1) {
    throw new DemoSeedFenceLostError(
      'The homepage demo seed lock row is missing; refusing the write.',
    );
  }

  const row = rows[0];
  if (row === undefined) {
    throw new DemoSeedFenceLostError(
      'The homepage demo seed lock row disappeared; refusing the write.',
    );
  }
  if (
    row.ownerToken !== fence.ownerToken ||
    row.fencingGeneration !== fence.generation ||
    row.operationId !== fence.operationId
  ) {
    throw new DemoSeedFenceLostError(
      'The homepage demo seed fencing generation/operation was superseded by another process; refusing the write.',
    );
  }

  const renewed = await tx.$queryRaw<Array<{ fencingGeneration: number }>>`
    UPDATE "HomepageDemoSeedLock"
    SET "leaseExpiresAt" = clock_timestamp() + make_interval(secs => ${leaseSeconds()}),
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${DEMO_LOCK_ID}
      AND "ownerToken" = ${fence.ownerToken}
      AND "fencingGeneration" = ${fence.generation}
      AND "leaseExpiresAt" IS NOT NULL
      AND "leaseExpiresAt" >= clock_timestamp()
    RETURNING "fencingGeneration"
  `;
  if (renewed.length !== 1) {
    throw new DemoSeedFenceLostError(
      'The homepage demo seed lease expired before this transaction acquired the fence; refusing the write.',
    );
  }
}
