import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaService } from '../../../common/database/prisma.service';

/**
 * Apply-stage safety gate for catalog/media imports.
 *
 * The import is only allowed against the positively identified local
 * development database and only with a verified backup artifact. A dry run
 * never calls this. Production/shared names are rejected explicitly, and the
 * backup must be a non-empty PostgreSQL dump whose SHA-256 is recorded in the
 * import log.
 */
export const EXPECTED_DEVELOPMENT_DATABASE = 'sabz';

const FORBIDDEN_DATABASE_PATTERN =
  /(prod|production|live|shared|staging|stage|master|main|replica)/i;

export interface ApplyGuardInput {
  prisma: PrismaService;
  confirmDatabase: string | undefined;
  backupPath: string | undefined;
  operation: string;
}

export interface ApplyGuardResult {
  database: string;
  backupPath: string;
  backupSha256: string;
  backupBytes: number;
  serverAddress: string | null;
}

export async function assertApplySafe(
  input: ApplyGuardInput,
): Promise<ApplyGuardResult> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Refusing ${input.operation}: NODE_ENV=production. The import is development-only.`,
    );
  }
  if (!input.confirmDatabase) {
    throw new Error(
      `Refusing ${input.operation}: pass --confirm-database <name>. The target database must be positively identified.`,
    );
  }
  if (FORBIDDEN_DATABASE_PATTERN.test(input.confirmDatabase)) {
    throw new Error(
      `Refusing ${input.operation}: database name "${input.confirmDatabase}" looks production/shared.`,
    );
  }
  const rows = await input.prisma.$queryRaw<
    Array<{ database: string; serverAddress: string | null }>
  >`SELECT current_database() AS database, inet_server_addr()::text AS "serverAddress"`;
  const identity = rows[0];
  if (!identity) {
    throw new Error(`Refusing ${input.operation}: database identity query failed.`);
  }
  if (identity.database !== input.confirmDatabase) {
    throw new Error(
      `Refusing ${input.operation}: connected database is "${identity.database}", not the confirmed "${input.confirmDatabase}".`,
    );
  }
  if (identity.database !== EXPECTED_DEVELOPMENT_DATABASE) {
    throw new Error(
      `Refusing ${input.operation}: this workflow is pinned to the isolated development database "${EXPECTED_DEVELOPMENT_DATABASE}" (got "${identity.database}").`,
    );
  }
  if (!input.backupPath) {
    throw new Error(
      `Refusing ${input.operation}: pass --backup <postgres-dump-path>. No apply without a verified backup.`,
    );
  }
  const bytes = readFileSync(input.backupPath);
  if (bytes.length < 1024) {
    throw new Error(
      `Refusing ${input.operation}: backup artifact is missing or too small (${bytes.length} bytes).`,
    );
  }
  const header = bytes.subarray(0, 5).toString('latin1');
  const looksLikeDump = header === 'PGDMP' || bytes.subarray(0, 40).toString('utf8').includes('PostgreSQL');
  if (!looksLikeDump) {
    throw new Error(
      `Refusing ${input.operation}: backup does not look like a PostgreSQL dump (header ${JSON.stringify(header)}).`,
    );
  }
  return {
    database: identity.database,
    backupPath: input.backupPath,
    backupSha256: createHash('sha256').update(bytes).digest('hex'),
    backupBytes: bytes.length,
    serverAddress: identity.serverAddress,
  };
}
