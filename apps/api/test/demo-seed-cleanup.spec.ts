import type { PrismaClient } from '@prisma/client';
import {
  CleanupError,
  assertMerchMediaMetadataRestored,
  finalizeCleanup,
  formatCleanupFailures,
  restoreMerchMediaMetadata,
  runCleanupActions,
  type CleanupFailure,
  type MerchMediaMetadataSnapshot,
} from './demo-seed-cleanup';

describe('demo-seed cleanup orchestration', () => {
  it('attempts every action in order and collects failures', async () => {
    const calls: string[] = [];
    const failures = await runCleanupActions([
      {
        name: 'first',
        resource: 'one',
        run: async () => {
          calls.push('first');
        },
      },
      {
        name: 'second',
        resource: 'two',
        run: async () => {
          calls.push('second');
          throw new Error('second failed');
        },
      },
      {
        name: 'third',
        run: async () => {
          calls.push('third');
        },
      },
    ]);

    expect(calls).toEqual(['first', 'second', 'third']);
    expect(failures).toEqual([
      expect.objectContaining({
        name: 'second',
        resource: 'two',
        error: expect.any(Error),
      }),
    ]);
    expect(formatCleanupFailures(failures)).toContain('second [two]');
  });

  it('runs a synchronous failing action without stopping later actions', async () => {
    const calls: string[] = [];
    const failures = await runCleanupActions([
      {
        name: 'sync failure',
        run: () => {
          calls.push('sync failure');
          throw new Error('sync failed');
        },
      },
      {
        name: 'after',
        run: () => {
          calls.push('after');
        },
      },
    ]);

    expect(calls).toEqual(['sync failure', 'after']);
    expect(failures).toHaveLength(1);
  });

  it('throws CleanupError when the test passed but cleanup failed', () => {
    const failures: CleanupFailure[] = [
      { name: 'delete media', resource: 'media-1', error: new Error('fk') },
    ];
    expect(() => finalizeCleanup(null, failures)).toThrow(CleanupError);
    try {
      finalizeCleanup(null, failures);
    } catch (error) {
      expect(error).toBeInstanceOf(CleanupError);
      expect((error as CleanupError).failures).toBe(failures);
      expect((error as Error).message).toContain('delete media [media-1]');
    }
  });

  it('preserves the primary test failure and attaches cleanup diagnostics', () => {
    const primary = new Error('primary test failure');
    const failures: CleanupFailure[] = [
      { name: 'restore draft', resource: 'draft-1', error: new Error('db') },
    ];
    try {
      finalizeCleanup(primary, failures);
      throw new Error('expected finalizeCleanup to throw');
    } catch (error) {
      expect(error).toBe(primary);
      expect((error as Error & { cleanupFailures?: CleanupFailure[] })
        .cleanupFailures).toBe(failures);
      expect(primary.message).toContain('primary test failure');
      expect(primary.message).toContain('restore draft [draft-1]');
    }
  });

  it('does not throw when neither test nor cleanup failed', () => {
    expect(() => finalizeCleanup(null, [])).not.toThrow();
  });

  it('restores exact publishedAt, updatedBy and updatedAt through raw SQL', async () => {
    const publishedAt = new Date('2026-11-10T20:50:15.442Z');
    const updatedAt = new Date('2026-11-11T09:00:00.000Z');
    const row: MerchMediaMetadataSnapshot = {
      id: 'media-1',
      publishedAt,
      updatedBy: 'operator',
      updatedAt,
    };
    const calls: unknown[][] = [];
    const executeRaw = async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<unknown> => {
      calls.push([strings.join('?'), ...values]);
      return 1;
    };

    await restoreMerchMediaMetadata(executeRaw, row);

    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toContain('UPDATE "MerchMedia"');
    expect(calls[0]![0]).toContain('"updatedAt" = ?');
    expect(calls[0]!.slice(1)).toEqual([
      publishedAt,
      'operator',
      updatedAt,
      'media-1',
    ]);
  });

  it('verifies captured media metadata exactly and reports mismatches', async () => {
    const rows: MerchMediaMetadataSnapshot[] = [
      {
        id: 'media-1',
        publishedAt: new Date('2026-11-10T20:50:15.442Z'),
        updatedBy: 'operator',
        updatedAt: new Date('2026-11-11T09:00:00.000Z'),
      },
    ];
    const findMany = jest.fn(async () => rows);
    const client = {
      merchMedia: { findMany },
    } as unknown as Pick<PrismaClient, 'merchMedia'>;

    await expect(
      assertMerchMediaMetadataRestored(client, rows),
    ).resolves.toBeUndefined();

    findMany.mockResolvedValueOnce([
      {
        ...rows[0]!,
        updatedBy: 'homepage-demo-seed',
      },
    ]);
    await expect(
      assertMerchMediaMetadataRestored(client, rows),
    ).rejects.toThrow(/updatedBy differs/);
  });

  it('reports a missing captured media row', async () => {
    const rows: MerchMediaMetadataSnapshot[] = [
      {
        id: 'media-missing',
        publishedAt: null,
        updatedBy: null,
        updatedAt: new Date('2026-11-11T09:00:00.000Z'),
      },
    ];
    const client = {
      merchMedia: { findMany: jest.fn(async () => []) },
    } as unknown as Pick<PrismaClient, 'merchMedia'>;

    await expect(
      assertMerchMediaMetadataRestored(client, rows),
    ).rejects.toThrow(/is missing/);
  });
});
