import type { PrismaClient } from '@prisma/client';
import { runReadOnlyTransaction } from './read-only';

describe('runReadOnlyTransaction', () => {
  it('sets the transaction READ ONLY before invoking the read callback', async () => {
    const events: string[] = [];
    const fake = {
      $transaction: async (
        fn: (tx: {
          $executeRawUnsafe: (sql: string) => Promise<void>;
        }) => Promise<unknown>,
      ) =>
        fn({
          $executeRawUnsafe: async (sql: string) => {
            events.push(sql);
          },
        }),
    } as unknown as Pick<PrismaClient, '$transaction'>;

    const result = await runReadOnlyTransaction(fake, async () => {
      events.push('callback');
      return 'planned';
    });

    expect(result).toBe('planned');
    expect(events).toEqual([
      'SET TRANSACTION READ ONLY',
      'callback',
    ]);
  });
});
