import { randomUUID } from 'crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  DEMO_LOCK_HEARTBEAT_MS,
  DEMO_LOCK_ID,
  DEMO_LOCK_LEASE_MS,
} from './constants';
import {
  DemoSeedFenceLostError,
  lockDemoSeedFence,
  type DemoSeedFence,
  type DemoSeedFenceIdentity,
} from './demo-fence';
import type { DemoSeedJournalIntent } from './types';
import { assertOperationId } from './operation-id';

export class DemoSeedLockUnavailableError extends Error {
  constructor() {
    super(
      'Another homepage demo seed operation holds the database lease. Wait for it to finish or for its lease to expire.',
    );
    this.name = 'DemoSeedLockUnavailableError';
  }
}

export interface DemoSeedLockHandle extends DemoSeedFence {
  assertHeld(): Promise<void>;
  release(): Promise<void>;
}

export interface DemoSeedCompletion {
  publicationId: string | null;
  publicationVersion: number | null;
  draftRevision: number;
  result: unknown | null;
}

export interface DemoSeedJournalHandle {
  /** Set when the operation id already completed with the same intent. */
  readonly completed: DemoSeedCompletion | null;
  readonly planHash: string;
  readonly intentHash: string;
  readonly baselineHash: string;
  recordMediaReconciliation(
    affectedMediaIds: string[],
    acknowledgedMediaIds: string[],
  ): Promise<void>;
  recordBackup(input: {
    path: string;
    checksum: string;
    revision: number;
  }): Promise<void>;
  advance(
    state: string,
    details?: Record<string, unknown>,
    stepKey?: string,
  ): Promise<void>;
  fail(reason: string): Promise<void>;
}

export interface DemoSeedGuardrails {
  acquireLock(operationId: string): Promise<DemoSeedLockHandle>;
  /** Read-only completion check; never creates or mutates operation state. */
  readCompletion(input: {
    operationId: string;
    planHash: string;
    intentHash: string;
  }): Promise<DemoSeedCompletion | null>;
  openJournal(input: {
    operationId: string;
    planHash: string;
    intentHash: string;
    baselineHash: string;
    intent: DemoSeedJournalIntent;
    fence: DemoSeedFence;
  }): Promise<DemoSeedJournalHandle>;
}

export type DemoSeedGuardrailPrisma = Pick<
  PrismaClient,
  | '$executeRaw'
  | '$queryRaw'
  | '$transaction'
  | 'homepageDemoSeedOperation'
>;

type LockPrisma = DemoSeedGuardrailPrisma;

const JOURNAL_STATES = [
  'STARTED',
  'PLANNED',
  'BACKED_UP',
  'MEDIA_UPLOAD_STARTED',
  'MEDIA_WRITTEN',
  'MEDIA_READY',
  'CAMPAIGN_WRITE_STARTED',
  'CAMPAIGN_WRITTEN',
  'CAMPAIGNS_READY',
  'BLOG_DRAFT_STARTED',
  'BLOG_DRAFT_WRITTEN',
  'BLOG_DRAFTS_READY',
  'MEDIA_ORPHAN_VERIFIED',
  'MEDIA_CONFLICT',
  'PUBLISHED',
  'DRAFT_READY',
  'COMPLETED',
  'FAILED',
] as const;

export type DemoSeedJournalState = (typeof JOURNAL_STATES)[number];

const ALLOWED_TRANSITIONS: Record<DemoSeedJournalState, DemoSeedJournalState[]> = {
  STARTED: ['STARTED', 'PLANNED', 'FAILED'],
  PLANNED: ['BACKED_UP', 'MEDIA_UPLOAD_STARTED', 'MEDIA_READY', 'FAILED'],
  BACKED_UP: ['MEDIA_UPLOAD_STARTED', 'MEDIA_READY', 'FAILED'],
  MEDIA_UPLOAD_STARTED: [
    'MEDIA_UPLOAD_STARTED',
    'MEDIA_WRITTEN',
    'MEDIA_ORPHAN_VERIFIED',
    'MEDIA_CONFLICT',
    'FAILED',
  ],
  MEDIA_WRITTEN: [
    'MEDIA_UPLOAD_STARTED',
    'MEDIA_WRITTEN',
    'MEDIA_ORPHAN_VERIFIED',
    'MEDIA_READY',
    'MEDIA_CONFLICT',
    'FAILED',
  ],
  MEDIA_READY: ['CAMPAIGN_WRITE_STARTED', 'CAMPAIGNS_READY', 'FAILED'],
  CAMPAIGN_WRITE_STARTED: [
    'CAMPAIGN_WRITE_STARTED',
    'CAMPAIGN_WRITTEN',
    'FAILED',
  ],
  CAMPAIGN_WRITTEN: [
    'CAMPAIGN_WRITE_STARTED',
    'CAMPAIGN_WRITTEN',
    'CAMPAIGNS_READY',
    'FAILED',
  ],
  CAMPAIGNS_READY: ['BLOG_DRAFT_STARTED', 'BLOG_DRAFTS_READY', 'FAILED'],
  BLOG_DRAFT_STARTED: [
    'BLOG_DRAFT_STARTED',
    'BLOG_DRAFT_WRITTEN',
    'FAILED',
  ],
  BLOG_DRAFT_WRITTEN: [
    'BLOG_DRAFT_STARTED',
    'BLOG_DRAFT_WRITTEN',
    'BLOG_DRAFTS_READY',
    'FAILED',
  ],
  BLOG_DRAFTS_READY: ['PUBLISHED', 'DRAFT_READY', 'COMPLETED', 'FAILED'],
  MEDIA_ORPHAN_VERIFIED: [
    'MEDIA_WRITTEN',
    'MEDIA_UPLOAD_STARTED',
    'FAILED',
  ],
  MEDIA_CONFLICT: ['FAILED'],
  PUBLISHED: ['COMPLETED'],
  DRAFT_READY: ['COMPLETED'],
  COMPLETED: [],
  FAILED: ['STARTED'],
};

export function assertJournalTransition(
  from: string,
  to: string,
): asserts to is DemoSeedJournalState {
  if (!JOURNAL_STATES.includes(to as DemoSeedJournalState)) {
    throw new Error(`Unknown homepage demo seed journal state: ${to}.`);
  }
  const current = from as DemoSeedJournalState;
  if (!JOURNAL_STATES.includes(current)) {
    throw new Error(`Unknown stored homepage demo seed journal state: ${from}.`);
  }
  if (!ALLOWED_TRANSITIONS[current].includes(to as DemoSeedJournalState)) {
    throw new Error(
      `Invalid homepage demo seed journal transition: ${from} -> ${to}.`,
    );
  }
}

class PrismaDemoSeedLockHandle implements DemoSeedLockHandle {
  readonly ownerToken = randomUUID();
  generation = 0;
  private readonly timer: NodeJS.Timeout;
  private tail: Promise<void> = Promise.resolve();
  private lostError: Error | null = null;
  private released = false;

  constructor(
    private readonly prisma: LockPrisma,
    readonly operationId: string,
    heartbeatMs: number,
  ) {
    this.timer = setInterval(() => {
      void this.enqueueHeartbeat();
    }, heartbeatMs);
    this.timer.unref?.();
  }

  async acquire(): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "HomepageDemoSeedLock" ("id", "updatedAt")
        VALUES (${DEMO_LOCK_ID}, clock_timestamp())
        ON CONFLICT ("id") DO NOTHING
      `;
      const rows =
        await this.prisma.$queryRaw<Array<{ fencingGeneration: number }>>`
        UPDATE "HomepageDemoSeedLock"
        SET "ownerToken" = ${this.ownerToken},
            "fencingGeneration" = "fencingGeneration" + 1,
            "leaseExpiresAt" = clock_timestamp() + make_interval(secs => ${DEMO_LOCK_LEASE_MS / 1000}),
            "operationId" = ${this.operationId},
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${DEMO_LOCK_ID}
          AND ("ownerToken" IS NULL OR "leaseExpiresAt" IS NULL OR "leaseExpiresAt" < clock_timestamp())
        RETURNING "fencingGeneration"
      `;
      const row = rows[0];
      if (rows.length !== 1 || row === undefined) {
        throw new DemoSeedLockUnavailableError();
      }
      this.generation = row.fencingGeneration;
    } catch (error) {
      // The heartbeat interval starts in the constructor. If acquisition
      // throws for any reason, stop it before propagating so a failed
      // acquisition cannot keep polling or renew a lease it never owned.
      clearInterval(this.timer);
      throw error;
    }
  }

  async lockWithinTransaction(tx: Prisma.TransactionClient): Promise<void> {
    await lockDemoSeedFence(tx, this);
  }

  async assertHeld(): Promise<void> {
    await this.enqueue(async () => {
      if (this.lostError) throw this.lostError;
      try {
        await this.assertHeldDirect();
      } catch (error) {
        this.lostError =
          error instanceof Error ? error : new Error(String(error));
        throw this.lostError;
      }
    });
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    clearInterval(this.timer);
    await this.tail.catch(() => undefined);
    try {
      await this.prisma.$executeRaw`
        UPDATE "HomepageDemoSeedLock"
        SET "ownerToken" = NULL,
            "leaseExpiresAt" = NULL,
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${DEMO_LOCK_ID}
          AND "ownerToken" = ${this.ownerToken}
          AND "fencingGeneration" = ${this.generation}
      `;
    } catch {
      // Lease expiry remains the fallback if the final release cannot be
      // written. Never mask the original apply failure.
    }
  }

  private enqueueHeartbeat(): Promise<void> {
    return this.enqueue(async () => {
      if (this.released || this.lostError) return;
      try {
        await this.assertHeldDirect();
      } catch (error) {
        this.lostError =
          error instanceof Error ? error : new Error(String(error));
        clearInterval(this.timer);
      }
    });
  }

  private async assertHeldDirect(): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ fencingGeneration: number }>>`
      UPDATE "HomepageDemoSeedLock"
      SET "leaseExpiresAt" = clock_timestamp() + make_interval(secs => ${DEMO_LOCK_LEASE_MS / 1000}),
          "updatedAt" = clock_timestamp()
      WHERE "id" = ${DEMO_LOCK_ID}
        AND "ownerToken" = ${this.ownerToken}
        AND "fencingGeneration" = ${this.generation}
        AND "leaseExpiresAt" IS NOT NULL
        AND "leaseExpiresAt" >= clock_timestamp()
      RETURNING "fencingGeneration"
    `;
    if (rows.length !== 1) {
      throw new DemoSeedFenceLostError(
        'The homepage demo seed database lease was lost or expired.',
      );
    }
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    const run = this.tail.then(fn, fn);
    this.tail = run.catch(() => undefined);
    return run;
  }
}

function parseCompletion(row: {
  state: string;
  publicationId: string | null;
  publicationVersion: number | null;
  draftRevision: number | null;
  result: Prisma.JsonValue | null;
}): DemoSeedCompletion | null {
  if (row.state !== 'COMPLETED') return null;
  if (row.draftRevision === null) {
    throw new Error(
      'Completed homepage demo seed operation is missing its draft revision.',
    );
  }
  return {
    publicationId: row.publicationId,
    publicationVersion: row.publicationVersion,
    draftRevision: row.draftRevision,
    result: row.result,
  };
}

class PrismaDemoSeedJournalHandle implements DemoSeedJournalHandle {
  completed: DemoSeedCompletion | null = null;

  constructor(
    private readonly prisma: LockPrisma,
    private readonly fence: DemoSeedFence,
    readonly operationId: string,
    readonly planHash: string,
    readonly intentHash: string,
    readonly baselineHash: string,
  ) {}

  async initialize(intent: DemoSeedJournalIntent): Promise<void> {
    const existing = await this.prisma.homepageDemoSeedOperation.findUnique({
      where: { id: this.operationId },
      select: {
        state: true,
        planHash: true,
        intentHash: true,
        baselineHash: true,
        publicationId: true,
        publicationVersion: true,
        draftRevision: true,
        result: true,
      },
    });

    if (existing !== null) {
      if (
        existing.intentHash !== this.intentHash ||
        existing.planHash !== this.planHash
      ) {
        throw new Error(
          `Operation ${this.operationId} already exists with a different immutable intent. Use a new HOMEPAGE_DEMO_OPERATION_ID.`,
        );
      }
      if (existing.state === 'COMPLETED') {
        this.completed = parseCompletion(existing);
        return;
      }
      if (existing.state === 'MEDIA_CONFLICT') {
        throw new Error(
          `Operation ${this.operationId} stopped on a media storage conflict. Inspect the recorded storage key and use a new operation id only after the conflict is resolved.`,
        );
      }
      if (existing.baselineHash !== this.baselineHash) {
        throw new Error(
          `Operation ${this.operationId} baseline changed after planning (draft, publication, catalog candidates or reconciliation set). Use a new HOMEPAGE_DEMO_OPERATION_ID after a fresh review.`,
        );
      }

      await this.transaction(async (tx) => {
        const updated = await tx.homepageDemoSeedOperation.updateMany({
          where: {
            id: this.operationId,
            intentHash: this.intentHash,
            state: { not: 'COMPLETED' },
          },
          data: {
            state: 'STARTED',
            failureReason: null,
            completedAt: null,
          },
        });
        if (updated.count !== 1) {
          throw new Error(
            `Operation ${this.operationId} changed while resuming; retry after inspecting the journal.`,
          );
        }
      });
      return;
    }

    await this.transaction(async (tx) => {
      await tx.homepageDemoSeedOperation.create({
        data: {
          id: this.operationId,
          state: 'STARTED',
          planHash: this.planHash,
          intentHash: this.intentHash,
          baselineHash: this.baselineHash,
          intent: intent as unknown as Prisma.InputJsonValue,
          startedAt: new Date(),
          steps: {},
        },
      });
    });
  }

  async recordMediaReconciliation(
    affectedMediaIds: string[],
    acknowledgedMediaIds: string[],
  ): Promise<void> {
    await this.transaction(async (tx) => {
      const updated = await tx.homepageDemoSeedOperation.updateMany({
        where: {
          id: this.operationId,
          intentHash: this.intentHash,
          state: { not: 'COMPLETED' },
        },
        data: {
          affectedMediaIds: affectedMediaIds as Prisma.InputJsonValue,
          acknowledgedMediaIds: acknowledgedMediaIds as Prisma.InputJsonValue,
        },
      });
      if (updated.count !== 1) {
        throw new Error(
          'The homepage demo seed journal cannot record media reconciliation for this intent.',
        );
      }
    });
  }

  async recordBackup(input: {
    path: string;
    checksum: string;
    revision: number;
  }): Promise<void> {
    await this.transaction(async (tx) => {
      const updated = await tx.homepageDemoSeedOperation.updateMany({
        where: {
          id: this.operationId,
          intentHash: this.intentHash,
          state: { not: 'COMPLETED' },
        },
        data: {
          backupPath: input.path,
          backupChecksum: input.checksum,
          backupRevision: input.revision,
        },
      });
      if (updated.count !== 1) {
        throw new Error(
          'The homepage demo seed journal cannot record a backup for this intent.',
        );
      }
    });
  }

  async advance(
    state: string,
    details: Record<string, unknown> = {},
    stepKey = state,
  ): Promise<void> {
    await this.transaction(async (tx) => {
      const row = await tx.homepageDemoSeedOperation.findUnique({
        where: { id: this.operationId },
        select: { state: true, steps: true, intentHash: true },
      });
      if (row === null || row.intentHash !== this.intentHash) {
        throw new Error(
          'The homepage demo seed journal intent no longer matches this operation.',
        );
      }
      assertJournalTransition(row.state, state);
      const steps = stepMap(row.steps);
      steps[stepKey] = { at: new Date().toISOString(), ...details };
      const updated = await tx.homepageDemoSeedOperation.updateMany({
        where: {
          id: this.operationId,
          state: row.state,
          intentHash: this.intentHash,
        },
        data: {
          state,
          steps: steps as Prisma.InputJsonValue,
        },
      });
      if (updated.count !== 1) {
        throw new Error(
          'The homepage demo seed journal changed concurrently; refusing the transition.',
        );
      }
    });
  }

  async fail(reason: string): Promise<void> {
    await this.transaction(async (tx) => {
      const row = await tx.homepageDemoSeedOperation.findUnique({
        where: { id: this.operationId },
        select: { state: true, steps: true, intentHash: true },
      });
      if (row === null || row.intentHash !== this.intentHash) {
        throw new Error(
          'The homepage demo seed journal intent no longer matches this operation.',
        );
      }
      if (row.state === 'COMPLETED') {
        return;
      }
      const steps = stepMap(row.steps);
      steps.FAILED = { at: new Date().toISOString(), reason: reason.slice(0, 2_000) };
      await tx.homepageDemoSeedOperation.updateMany({
        where: {
          id: this.operationId,
          intentHash: this.intentHash,
          state: { not: 'COMPLETED' },
        },
        data: {
          state: 'FAILED',
          failureReason: reason.slice(0, 2_000),
          steps: steps as Prisma.InputJsonValue,
        },
      });
    });
  }

  private async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.fence.lockWithinTransaction(tx);
        return fn(tx);
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }
}

function stepMap(value: Prisma.JsonValue): Record<string, unknown> {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export interface CompleteOperationInput {
  operationId: string;
  intentHash: string;
  /** Observed journal state immediately before completion. */
  expectedState: string;
  publicationMode: 'draft' | 'publish';
  publicationId: string | null;
  publicationVersion: number | null;
  draftRevision: number;
  result: unknown;
  completedAt: Date;
  /** Required: validated in this transaction before any journal mutation. */
  fence: DemoSeedFence;
}

/**
 * Authoritative journal completion. The fence is validated in this transaction
 * before the journal mutation, and the publication relationship is validated
 * in the same transaction. The caller must pass the same transaction client
 * that created the publication.
 */
export async function completeDemoSeedOperationWithinTransaction(
  tx: Prisma.TransactionClient,
  input: CompleteOperationInput,
): Promise<void> {
  if (
    input.fence === undefined ||
    typeof input.fence.lockWithinTransaction !== 'function'
  ) {
    throw new Error(
      'Homepage demo seed journal completion requires a validated fence.',
    );
  }
  await input.fence.lockWithinTransaction(tx);

  if (input.publicationMode === 'publish') {
    if (input.publicationId === null || input.publicationVersion === null) {
      throw new Error(
        'A publish operation cannot complete without a publication id and version.',
      );
    }
  } else if (
    input.publicationId !== null ||
    input.publicationVersion !== null
  ) {
    throw new Error(
      'A draft-only operation cannot complete with publication details.',
    );
  }

  const resultRecord =
    typeof input.result === 'object' && input.result !== null
      ? (input.result as {
          draft?: {
            revision?: unknown;
            publicationId?: unknown;
            publicationVersion?: unknown;
          };
        })
      : null;
  if (
    resultRecord?.draft === undefined ||
    resultRecord.draft.revision !== input.draftRevision ||
    resultRecord.draft.publicationId !== input.publicationId ||
    resultRecord.draft.publicationVersion !== input.publicationVersion
  ) {
    throw new Error(
      'The completion result publication details do not match the supplied publication and draft revision.',
    );
  }

  if (input.publicationId !== null) {
    const publicationRows = await tx.$queryRaw<
      Array<{
        id: string;
        version: number;
        status: string;
        demoSeedOperationId: string | null;
      }>
    >`
      SELECT "id", "version", "status", "demoSeedOperationId"
      FROM "HomepagePublication"
      WHERE "id" = ${input.publicationId}
      FOR UPDATE
    `;
    const publication = publicationRows[0];
    if (publication === undefined) {
      throw new Error(
        'The supplied publication does not exist; refusing to complete the journal.',
      );
    }
    if (publication.demoSeedOperationId !== input.operationId) {
      throw new Error(
        'The supplied publication belongs to a different demo-seed operation.',
      );
    }
    if (publication.version !== input.publicationVersion) {
      throw new Error(
        'The supplied publication version does not match the journal completion.',
      );
    }
    if (publication.status !== 'PUBLISHED') {
      throw new Error(
        `The supplied publication is ${publication.status}, not PUBLISHED.`,
      );
    }
  }

  const rows = await tx.$queryRaw<
    Array<{
      state: string;
      intentHash: string | null;
      steps: Prisma.JsonValue;
    }>
  >`
    SELECT "state", "intentHash", "steps"
    FROM "HomepageDemoSeedOperation"
    WHERE "id" = ${input.operationId}
    FOR UPDATE
  `;
  if (rows.length !== 1) {
    throw new Error(
      `Homepage demo seed journal ${input.operationId} does not exist.`,
    );
  }
  const row = rows[0];
  if (row === undefined) {
    throw new Error(
      `Homepage demo seed journal ${input.operationId} disappeared before completion.`,
    );
  }
  if (row.intentHash !== input.intentHash) {
    throw new Error(
      'The homepage demo seed journal intent changed before publication commit.',
    );
  }
  if (row.state !== input.expectedState) {
    throw new Error(
      `Homepage demo seed journal state changed before publication commit: expected ${input.expectedState}, found ${row.state}.`,
    );
  }
  assertJournalTransition(row.state, 'COMPLETED');

  const steps = stepMap(row.steps);
  steps.PUBLICATION_COMMITTED = {
    at: input.completedAt.toISOString(),
    draftRevision: input.draftRevision,
    publicationId: input.publicationId,
    publicationVersion: input.publicationVersion,
  };
  steps.COMPLETED = { at: input.completedAt.toISOString() };

  const updated = await tx.homepageDemoSeedOperation.updateMany({
    where: {
      id: input.operationId,
      intentHash: input.intentHash,
      state: input.expectedState,
    },
    data: {
      state: 'COMPLETED',
      publicationId: input.publicationId,
      publicationVersion: input.publicationVersion,
      draftRevision: input.draftRevision,
      result: input.result as Prisma.InputJsonValue,
      completedAt: input.completedAt,
      failureReason: null,
      steps: steps as Prisma.InputJsonValue,
    },
  });
  if (updated.count !== 1) {
    throw new Error(
      'The homepage demo seed journal could not be completed atomically with the publication.',
    );
  }
}

export class PrismaDemoSeedGuardrails implements DemoSeedGuardrails {
  constructor(
    private readonly prisma: LockPrisma,
    private readonly heartbeatMs = DEMO_LOCK_HEARTBEAT_MS,
  ) {}

  async acquireLock(operationId: string): Promise<DemoSeedLockHandle> {
    assertOperationId(operationId);
    const handle = new PrismaDemoSeedLockHandle(
      this.prisma,
      operationId,
      this.heartbeatMs,
    );
    await handle.acquire();
    return handle;
  }

  async readCompletion(input: {
    operationId: string;
    planHash: string;
    intentHash: string;
  }): Promise<DemoSeedCompletion | null> {
    assertOperationId(input.operationId);
    const existing = await this.prisma.homepageDemoSeedOperation.findUnique({
      where: { id: input.operationId },
      select: {
        state: true,
        planHash: true,
        intentHash: true,
        publicationId: true,
        publicationVersion: true,
        draftRevision: true,
        result: true,
      },
    });
    if (existing === null) return null;
    if (
      existing.planHash !== input.planHash ||
      existing.intentHash !== input.intentHash
    ) {
      throw new Error(
        `Operation ${input.operationId} already exists with a different immutable intent. Use a new HOMEPAGE_DEMO_OPERATION_ID.`,
      );
    }
    return existing.state === 'COMPLETED'
      ? parseCompletion(existing)
      : null;
  }

  async openJournal(input: {
    operationId: string;
    planHash: string;
    intentHash: string;
    baselineHash: string;
    intent: DemoSeedJournalIntent;
    fence: DemoSeedFence;
  }): Promise<DemoSeedJournalHandle> {
    assertOperationId(input.operationId);
    const journal = new PrismaDemoSeedJournalHandle(
      this.prisma,
      input.fence,
      input.operationId,
      input.planHash,
      input.intentHash,
      input.baselineHash,
    );
    await journal.initialize(input.intent);
    return journal;
  }
}

export type { DemoSeedFenceIdentity };
