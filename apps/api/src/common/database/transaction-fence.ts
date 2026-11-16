import type { Prisma } from '@prisma/client';

/**
 * Optional transactional participation guard for privileged write commands.
 *
 * The guard is called as the first statement inside the same interactive
 * transaction that performs the protected writes. It must lock and validate
 * its coordination record before returning. Ordinary application callers pass
 * no fence, so this interface does not add a global write dependency.
 */
export interface TransactionFence {
  lockWithinTransaction(tx: Prisma.TransactionClient): Promise<void>;
}

export async function acquireTransactionFence(
  fence: TransactionFence | undefined,
  tx: Prisma.TransactionClient,
): Promise<void> {
  if (fence !== undefined) {
    await fence.lockWithinTransaction(tx);
  }
}
