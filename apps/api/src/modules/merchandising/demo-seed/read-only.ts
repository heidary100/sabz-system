import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Runs a callback inside a PostgreSQL transaction that is explicitly READ ONLY
 * before any application query executes. This is the database-level companion
 * to the application-level read-only repository used by the planner.
 */
export async function runReadOnlyTransaction<T>(
  prisma: Pick<PrismaClient, '$transaction'>,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return fn(tx);
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}
