import type { PrismaClient } from '@prisma/client';

/**
 * Small, DB-free cleanup orchestration helpers used by the guarded demo-seed
 * PostgreSQL suite. They do not make cleanup transactional; they make every
 * independent action attemptable and keep failures visible.
 */

export interface CleanupAction {
  name: string;
  resource?: string;
  run: () => Promise<void> | void;
}

export interface CleanupFailure {
  name: string;
  resource?: string;
  error: unknown;
}

export interface ErrorWithCleanupFailures extends Error {
  cleanupFailures?: CleanupFailure[];
}

export class CleanupError extends Error {
  readonly failures: CleanupFailure[];

  constructor(failures: CleanupFailure[], primary?: unknown) {
    super(`Integration cleanup failed:\n${formatCleanupFailures(failures)}`);
    this.name = 'CleanupError';
    this.failures = failures;
    if (primary !== undefined) {
      (this as Error & { cause?: unknown }).cause = primary;
    }
  }
}

export function formatCleanupFailures(failures: CleanupFailure[]): string {
  if (failures.length === 0) return '(none)';
  return failures
    .map((failure) => {
      const resource =
        failure.resource === undefined ? '' : ` [${failure.resource}]`;
      const message =
        failure.error instanceof Error
          ? failure.error.message
          : String(failure.error);
      return `- ${failure.name}${resource}: ${message}`;
    })
    .join('\n');
}

/**
 * Runs every action in array order. A failure in one action never prevents the
 * remaining independent actions from running. Failures are returned, not
 * swallowed.
 */
export async function runCleanupActions(
  actions: CleanupAction[],
): Promise<CleanupFailure[]> {
  const failures: CleanupFailure[] = [];
  for (const action of actions) {
    try {
      await action.run();
    } catch (error) {
      failures.push({
        name: action.name,
        resource: action.resource,
        error,
      });
    }
  }
  return failures;
}

/**
 * Preserves the primary test failure when cleanup also fails. A single Error
 * object is rethrown with additional diagnostics; non-Error throwables are
 * wrapped in CleanupError with the primary value as the cause.
 */
export function finalizeCleanup(
  primaryError: unknown | null,
  failures: CleanupFailure[],
): void {
  if (failures.length === 0) {
    if (primaryError !== null) throw primaryError;
    return;
  }
  if (primaryError === null) {
    throw new CleanupError(failures);
  }
  if (primaryError instanceof Error) {
    const error = primaryError as ErrorWithCleanupFailures;
    error.cleanupFailures = failures;
    if (!error.message.includes('Cleanup failures:')) {
      error.message = `${error.message}\n\nCleanup failures:\n${formatCleanupFailures(failures)}`;
    }
    throw error;
  }
  throw new CleanupError(failures, primaryError);
}

export interface MerchMediaMetadataSnapshot {
  id: string;
  publishedAt: Date | null;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface HomepageDraftSnapshot {
  id: string;
  revision: number;
  schemaVersion: number;
  sections: unknown;
  createdBy: string | null;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface HomepagePublicationStatusSnapshot {
  id: string;
  status: string;
  updatedAt: Date;
}

export type ExecuteRawTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown>;

/**
 * Restores the exact metadata fields modified by
 * `reconcilePublishedMediaEligibility` on a pre-existing media row. Raw SQL is
 * required so the Prisma `@updatedAt` behavior cannot replace the captured
 * timestamp.
 */
export async function restoreMerchMediaMetadata(
  executeRaw: ExecuteRawTag,
  row: MerchMediaMetadataSnapshot,
): Promise<void> {
  await executeRaw`
    UPDATE "MerchMedia"
    SET "publishedAt" = ${row.publishedAt},
        "updatedBy" = ${row.updatedBy},
        "updatedAt" = ${row.updatedAt}
    WHERE "id" = ${row.id}
  `;
}

function sameDate(left: Date | null, right: Date | null): boolean {
  if (left === null || right === null) return left === right;
  return left.getTime() === right.getTime();
}

/**
 * Verifies that all captured pre-existing media rows were restored exactly.
 * Only captured IDs are read.
 */
export async function assertMerchMediaMetadataRestored(
  client: Pick<PrismaClient, 'merchMedia'>,
  rows: MerchMediaMetadataSnapshot[],
): Promise<void> {
  if (rows.length === 0) return;
  const current = await client.merchMedia.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    select: {
      id: true,
      publishedAt: true,
      updatedBy: true,
      updatedAt: true,
    },
  });
  const byId = new Map(current.map((row) => [row.id, row]));
  const problems: string[] = [];
  for (const expected of rows) {
    const actual = byId.get(expected.id);
    if (!actual) {
      problems.push(`media ${expected.id} is missing`);
      continue;
    }
    if (!sameDate(actual.publishedAt, expected.publishedAt)) {
      problems.push(`media ${expected.id} publishedAt differs`);
    }
    if (actual.updatedBy !== expected.updatedBy) {
      problems.push(`media ${expected.id} updatedBy differs`);
    }
    if (!sameDate(actual.updatedAt, expected.updatedAt)) {
      problems.push(`media ${expected.id} updatedAt differs`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Pre-existing media metadata restoration failed: ${problems.join('; ')}`,
    );
  }
}

/**
 * Restores the exact draft row captured before the test. Prisma's @updatedAt
 * behavior would replace the original timestamp, so raw SQL is required.
 */
export async function restoreHomepageDraft(
  executeRaw: ExecuteRawTag,
  row: HomepageDraftSnapshot,
): Promise<void> {
  await executeRaw`
    UPDATE "HomepageDraft"
    SET "revision" = ${row.revision},
        "schemaVersion" = ${row.schemaVersion},
        "sections" = ${JSON.stringify(row.sections)}::jsonb,
        "createdBy" = ${row.createdBy},
        "updatedBy" = ${row.updatedBy},
        "updatedAt" = ${row.updatedAt}
    WHERE "id" = ${row.id}
  `;
}

export async function assertHomepageDraftRestored(
  client: Pick<PrismaClient, 'homepageDraft'>,
  row: HomepageDraftSnapshot | null,
  draftId: string,
): Promise<void> {
  const current = await client.homepageDraft.findUnique({
    where: { id: draftId },
    select: {
      revision: true,
      schemaVersion: true,
      sections: true,
      createdBy: true,
      updatedBy: true,
      updatedAt: true,
    },
  });
  if (row === null) {
    if (current !== null) {
      throw new Error(`Unexpected homepage draft ${draftId} remains after cleanup.`);
    }
    return;
  }
  if (current === null) {
    throw new Error(`Pre-existing homepage draft ${draftId} is missing.`);
  }
  const problems: string[] = [];
  if (current.revision !== row.revision) problems.push('revision differs');
  if (current.schemaVersion !== row.schemaVersion) {
    problems.push('schemaVersion differs');
  }
  if (JSON.stringify(current.sections) !== JSON.stringify(row.sections)) {
    problems.push('sections differ');
  }
  if (current.createdBy !== row.createdBy) problems.push('createdBy differs');
  if (current.updatedBy !== row.updatedBy) problems.push('updatedBy differs');
  if (!sameDate(current.updatedAt, row.updatedAt)) problems.push('updatedAt differs');
  if (problems.length > 0) {
    throw new Error(
      `Pre-existing homepage draft restoration failed: ${problems.join('; ')}`,
    );
  }
}

/**
 * Restores a pre-existing publication's status and exact updated timestamp.
 */
export async function restoreHomepagePublicationStatus(
  executeRaw: ExecuteRawTag,
  row: HomepagePublicationStatusSnapshot,
): Promise<void> {
  await executeRaw`
    UPDATE "HomepagePublication"
    SET "status" = ${row.status}::"HomepagePublicationStatus",
        "updatedAt" = ${row.updatedAt}
    WHERE "id" = ${row.id}
  `;
}

export async function assertHomepagePublicationStatusRestored(
  client: Pick<PrismaClient, 'homepagePublication'>,
  rows: HomepagePublicationStatusSnapshot[],
): Promise<void> {
  if (rows.length === 0) return;
  const current = await client.homepagePublication.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    select: { id: true, status: true, updatedAt: true },
  });
  const byId = new Map(current.map((row) => [row.id, row]));
  const problems: string[] = [];
  for (const expected of rows) {
    const actual = byId.get(expected.id);
    if (!actual) {
      problems.push(`publication ${expected.id} is missing`);
      continue;
    }
    if (actual.status !== expected.status) {
      problems.push(`publication ${expected.id} status differs`);
    }
    if (!sameDate(actual.updatedAt, expected.updatedAt)) {
      problems.push(`publication ${expected.id} updatedAt differs`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Pre-existing publication restoration failed: ${problems.join('; ')}`,
    );
  }
}
