import {
  DemoSeedLockUnavailableError,
  PrismaDemoSeedGuardrails,
  assertJournalTransition,
  completeDemoSeedOperationWithinTransaction,
  type DemoSeedGuardrailPrisma,
} from './guardrails';
import type { DemoSeedIntentPayload, DemoSeedJournalIntent } from './types';

interface JournalRow {
  id: string;
  state: string;
  planHash: string | null;
  intentHash: string | null;
  baselineHash: string | null;
  publicationId: string | null;
  publicationVersion: number | null;
  draftRevision: number | null;
  result: unknown;
  steps: Record<string, unknown>;
  failureReason: string | null;
  completedAt: Date | null;
}

const intent = {
  version: 1,
  operationId: 'operation-1',
  identity: {
    systemIdentifier: '1',
    databaseName: 'sabz_test',
    databaseOid: 1,
    postgresVersion: '16',
    fingerprint: 'a'.repeat(64),
  },
  manifestHash: 'b'.repeat(64),
  planHash: 'c'.repeat(64),
  publicationMode: 'publish',
  assets: [],
  mediaReconciliationAckIds: [],
  replaceDraft: true,
  publish: true,
  acknowledgePublicationReplacement: true,
  publicApiBaseUrl: 'https://shop.example.com/api/v1',
  manifest: {} as never,
} satisfies DemoSeedIntentPayload;

const journalIntent: DemoSeedJournalIntent = {
  content: intent,
  baseline: {
    draft: null,
    publications: [],
    candidates: {
      products: [],
      categories: [],
      brands: [],
      productsByBrand: {},
    },
    campaignPayloads: [],
    sections: [],
    spotlightCategoryId: null,
    mediaReconciliation: {
      affectedIds: [],
      acknowledgedIds: [],
      matchesAck: true,
    },
    publication: {
      action: 'publish',
      supersedes: [],
      currentPublishedVersions: [],
      requiresAck: false,
    },
    draftPlan: {
      action: 'none',
      sourceRevision: null,
      requiresBackup: false,
    },
    publicApiBaseUrl: 'https://shop.example.com/api/v1',
  },
};

function fakePrisma(
  existing: JournalRow | null = null,
  unavailable = false,
) {
  const state = {
    ownerToken: 'owner' as string,
    unavailable,
    journal: existing === null ? null : { ...existing },
  };

  const client: Record<string, unknown> = {
    $executeRaw: jest.fn(async () => 1),
    $queryRaw: jest.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        if (sql.includes('SET "ownerToken"')) {
          state.ownerToken = String(values[0]);
          return state.unavailable ? [] : [{ fencingGeneration: 1 }];
        }
        if (sql.includes('SET "leaseExpiresAt"')) {
          return state.unavailable ? [] : [{ fencingGeneration: 1 }];
        }
        if (sql.includes('SELECT "ownerToken"')) {
          return [
            {
              ownerToken: state.ownerToken,
              fencingGeneration: 1,
              leaseExpiresAt: new Date(Date.now() + 120_000),
              operationId: 'operation-1',
            },
          ];
        }
        if (sql.includes('SELECT "state", "intentHash", "steps"')) {
          if (state.journal === null) return [];
          return [
            {
              state: state.journal.state,
              intentHash: state.journal.intentHash,
              steps: state.journal.steps,
            },
          ];
        }
        return [];
      },
    ),
    $transaction: jest.fn(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
    ),
    homepageDemoSeedOperation: {
      findUnique: jest.fn(async () => state.journal),
      create: jest.fn(async ({ data }: { data: Partial<JournalRow> }) => {
        state.journal = {
          id: data.id ?? 'operation-1',
          state: data.state ?? 'STARTED',
          planHash: data.planHash ?? null,
          intentHash: data.intentHash ?? null,
          baselineHash: data.baselineHash ?? null,
          publicationId: null,
          publicationVersion: null,
          draftRevision: null,
          result: null,
          steps: {},
          failureReason: null,
          completedAt: null,
          ...data,
        } as JournalRow;
        return state.journal;
      }),
      updateMany: jest.fn(
        async ({ data }: { data: Partial<JournalRow> }) => {
          if (state.journal === null) return { count: 0 };
          state.journal = { ...state.journal, ...data } as JournalRow;
          return { count: 1 };
        },
      ),
      update: jest.fn(async ({ data }: { data: Partial<JournalRow> }) => {
        if (state.journal === null) throw new Error('missing');
        state.journal = { ...state.journal, ...data } as JournalRow;
        return state.journal;
      }),
    },
  };

  return client as unknown as DemoSeedGuardrailPrisma & {
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
    homepageDemoSeedOperation: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
  };
}

async function open(
  prisma: ReturnType<typeof fakePrisma>,
  operationId = 'operation-1',
) {
  const guardrails = new PrismaDemoSeedGuardrails(prisma, 1_000_000);
  const lock = await guardrails.acquireLock(operationId);
  const journal = await guardrails.openJournal({
    operationId,
    planHash: intent.planHash,
    intentHash: 'intent-hash',
    baselineHash: 'baseline-hash',
    intent: journalIntent,
    fence: lock,
  });
  return { guardrails, lock, journal };
}

describe('homepage demo seed guardrails', () => {
  it('acquires a monotonically fenced lease and releases only its own row', async () => {
    const prisma = fakePrisma();
    const guardrails = new PrismaDemoSeedGuardrails(prisma, 1_000_000);
    const lock = await guardrails.acquireLock('operation-1');
    expect(lock.generation).toBe(1);
    await lock.assertHeld();
    await lock.release();
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it('fails closed when another operation holds a live lease', async () => {
    const prisma = fakePrisma(null, true);
    const guardrails = new PrismaDemoSeedGuardrails(prisma, 1_000_000);
    await expect(guardrails.acquireLock('operation-2')).rejects.toBeInstanceOf(
      DemoSeedLockUnavailableError,
    );
  });

  it('clears the heartbeat timer when acquisition throws', async () => {
    jest.useFakeTimers();
    try {
      const prisma = fakePrisma();
      prisma.$executeRaw.mockRejectedValueOnce(new Error('database down'));
      const guardrails = new PrismaDemoSeedGuardrails(prisma, 1_000);
      await expect(guardrails.acquireLock('operation-4')).rejects.toThrow(
        'database down',
      );
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('aborts a standalone assertion when the lease is lost', async () => {
    const prisma = fakePrisma();
    const guardrails = new PrismaDemoSeedGuardrails(prisma, 1_000_000);
    const lock = await guardrails.acquireLock('operation-3');
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(lock.assertHeld()).rejects.toThrow(/lease was lost/);
    await lock.release();
  });

  it('refuses journal completion without a validated fence', async () => {
    const prisma = fakePrisma();
    await expect(
      prisma.$transaction((tx) =>
        completeDemoSeedOperationWithinTransaction(
          tx as never,
          {
            operationId: 'operation-1',
            intentHash: 'intent-hash',
            expectedState: 'BLOG_DRAFTS_READY',
            publicationMode: 'draft',
            publicationId: null,
            publicationVersion: null,
            draftRevision: 1,
            result: {
              draft: {
                revision: 1,
                publicationId: null,
                publicationVersion: null,
                supersededVersions: [],
              },
            },
            completedAt: new Date(),
            fence: undefined as never,
          },
        ),
      ),
    ).rejects.toThrow(/requires a validated fence/);
  });

  it('rejects a completion result bound to a different draft revision', async () => {
    const prisma = fakePrisma();
    const fence = {
      ownerToken: 'owner',
      generation: 1,
      operationId: 'operation-1',
      lockWithinTransaction: async () => undefined,
    };
    await expect(
      prisma.$transaction((tx) =>
        completeDemoSeedOperationWithinTransaction(tx as never, {
          operationId: 'operation-1',
          intentHash: 'intent-hash',
          expectedState: 'BLOG_DRAFTS_READY',
          publicationMode: 'draft',
          publicationId: null,
          publicationVersion: null,
          draftRevision: 2,
          result: {
            draft: {
              revision: 1,
              publicationId: null,
              publicationVersion: null,
              supersededVersions: [],
            },
          },
          completedAt: new Date(),
          fence,
        }),
      ),
    ).rejects.toThrow(/do not match/);
  });

  it('rejects an invalid journal transition', () => {
    expect(() => assertJournalTransition('PLANNED', 'PUBLISHED')).toThrow(
      /Invalid homepage demo seed journal transition/,
    );
    expect(() =>
      assertJournalTransition('BLOG_DRAFTS_READY', 'COMPLETED'),
    ).not.toThrow();
  });

  it('creates, advances and fails the durable operation journal', async () => {
    const prisma = fakePrisma();
    const { journal } = await open(prisma);
    await journal.recordMediaReconciliation(['media-a'], ['media-a']);
    await journal.recordBackup({
      path: '/tmp/backup.json',
      checksum: 'a'.repeat(64),
      revision: 3,
    });
    await journal.advance('PLANNED', { test: true });
    await journal.advance('MEDIA_UPLOAD_STARTED');
    await journal.advance('MEDIA_WRITTEN');
    await journal.fail('boom');
    expect(prisma.homepageDemoSeedOperation.create).toHaveBeenCalled();
  });

  it('returns the stored result for a completed operation with the same intent', async () => {
    const prisma = fakePrisma({
      id: 'operation-1',
      state: 'COMPLETED',
      planHash: intent.planHash,
      intentHash: 'intent-hash',
      baselineHash: 'baseline-hash',
      publicationId: 'publication-1',
      publicationVersion: 9,
      draftRevision: 7,
      result: { draft: { revision: 7 } },
      steps: {},
      failureReason: null,
      completedAt: new Date(),
    });
    const { journal } = await open(prisma);
    expect(journal.completed).toEqual({
      publicationId: 'publication-1',
      publicationVersion: 9,
      draftRevision: 7,
      result: { draft: { revision: 7 } },
    });
  });

  it('rejects reuse of an operation id with a different immutable intent', async () => {
    const prisma = fakePrisma({
      id: 'operation-1',
      state: 'FAILED',
      planHash: intent.planHash,
      intentHash: 'different-intent',
      baselineHash: 'baseline-hash',
      publicationId: null,
      publicationVersion: null,
      draftRevision: null,
      result: null,
      steps: {},
      failureReason: 'previous',
      completedAt: null,
    });
    await expect(open(prisma)).rejects.toThrow(/different immutable intent/);
  });

  it('rejects an incomplete retry whose planning baseline changed', async () => {
    const prisma = fakePrisma({
      id: 'operation-1',
      state: 'FAILED',
      planHash: intent.planHash,
      intentHash: 'intent-hash',
      baselineHash: 'old-baseline',
      publicationId: null,
      publicationVersion: null,
      draftRevision: null,
      result: null,
      steps: {},
      failureReason: 'previous',
      completedAt: null,
    });
    await expect(open(prisma)).rejects.toThrow(/baseline changed after planning/);
  });

  it('refuses to resume a media storage conflict automatically', async () => {
    const prisma = fakePrisma({
      id: 'operation-1',
      state: 'MEDIA_CONFLICT',
      planHash: intent.planHash,
      intentHash: 'intent-hash',
      baselineHash: 'baseline-hash',
      publicationId: null,
      publicationVersion: null,
      draftRevision: null,
      result: null,
      steps: {},
      failureReason: 'conflict',
      completedAt: null,
    });
    await expect(open(prisma)).rejects.toThrow(/media storage conflict/);
  });
});
