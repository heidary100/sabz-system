import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { DatabaseIdentity, DemoSeedBlocker, DemoSeedOptions } from './types';

/**
 * Deterministic accident-prevention fingerprint.
 *
 * PostgreSQL physical clones keep the same system identifier. This fingerprint
 * is therefore a guard against running against the wrong configured database,
 * not a cryptographic proof of provenance.
 */
export function computeDatabaseFingerprint(input: {
  systemIdentifier: string;
  databaseName: string;
  databaseOid: number;
}): string {
  return createHash('sha256')
    .update(
      `${input.systemIdentifier}|${input.databaseName}|${input.databaseOid}`,
    )
    .digest('hex');
}

export interface RawDatabaseIdentity {
  systemIdentifier: string;
  databaseName: string;
  databaseOid: string;
  postgresVersion: string;
}

export function normalizeDatabaseIdentity(
  raw: RawDatabaseIdentity,
): DatabaseIdentity {
  const databaseOid = Number(raw.databaseOid);
  if (!Number.isSafeInteger(databaseOid) || databaseOid <= 0) {
    throw new Error('Database OID is not a positive safe integer.');
  }
  return {
    systemIdentifier: raw.systemIdentifier,
    databaseName: raw.databaseName,
    databaseOid,
    postgresVersion: raw.postgresVersion,
    fingerprint: computeDatabaseFingerprint({
      systemIdentifier: raw.systemIdentifier,
      databaseName: raw.databaseName,
      databaseOid,
    }),
  };
}

/**
 * Reads only PostgreSQL identity data. The caller must run this in a read-only
 * transaction or against a read-only connection.
 */
export async function readDatabaseIdentity(
  client: Pick<PrismaClient, '$queryRaw'>,
): Promise<DatabaseIdentity> {
  const rows = await client.$queryRaw<RawDatabaseIdentity[]>`
    SELECT
      (SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier",
      current_database() AS "databaseName",
      (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS "databaseOid",
      current_setting('server_version') AS "postgresVersion"
  `;
  const raw = rows[0];
  if (!raw) {
    throw new Error('Database identity query returned no rows.');
  }
  return normalizeDatabaseIdentity(raw);
}

export function assertDevelopmentEnvironment(
  nodeEnv: string | undefined,
): void {
  if (nodeEnv !== 'development') {
    throw new Error(
      'Homepage demo seed requires NODE_ENV=development explicitly. Production and test environments are refused.',
    );
  }
}

export function environmentGuardBlockers(
  options: Pick<DemoSeedOptions, 'nodeEnv'>,
): DemoSeedBlocker[] {
  if (options.nodeEnv === 'development') {
    return [];
  }
  return [
    {
      code: 'NODE_ENV_NOT_DEVELOPMENT',
      message:
        'NODE_ENV must be explicitly "development"; the demo seed refuses production and test environments.',
      severity: 'BLOCKER',
    },
  ];
}

export function applyGuardBlockers(
  options: DemoSeedOptions,
  identity: DatabaseIdentity,
): DemoSeedBlocker[] {
  const blockers = environmentGuardBlockers(options);
  if (!options.confirm) {
    blockers.push({
      code: 'CONFIRMATION_MISSING',
      message:
        'Set HOMEPAGE_DEMO_CONFIRM=1 to authorize an apply operation.',
      severity: 'BLOCKER',
    });
  }
  if (options.expectedFingerprint === null) {
    blockers.push({
      code: 'EXPECTED_FINGERPRINT_MISSING',
      message:
        'Set HOMEPAGE_DEMO_EXPECTED_FINGERPRINT to the exact identity fingerprint after running the identity command.',
      severity: 'BLOCKER',
    });
  } else if (options.expectedFingerprint !== identity.fingerprint) {
    blockers.push({
      code: 'FINGERPRINT_MISMATCH',
      message:
        'The supplied expected fingerprint does not match the connected database.',
      severity: 'BLOCKER',
    });
  }
  if (options.publish && !options.publishConfirm) {
    blockers.push({
      code: 'PUBLISH_CONFIRMATION_MISSING',
      message:
        'Publishing requires a separate HOMEPAGE_DEMO_PUBLISH_CONFIRM=1 acknowledgement.',
      severity: 'BLOCKER',
    });
  }
  return blockers;
}

const PRIVATE_IPV4 =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;

export interface PublicBaseUrlValidation {
  valid: boolean;
  reason: string | null;
}

/**
 * Media and blog cover URLs must be usable by a remote customer's browser.
 * Compose-internal/service names, localhost and private addresses are rejected.
 */
export function validatePublicApiBaseUrl(
  value: string | null,
): PublicBaseUrlValidation {
  if (!value || value.trim() === '') {
    return { valid: false, reason: 'HOMEPAGE_DEMO_PUBLIC_API_BASE_URL is required.' };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { valid: false, reason: 'The public API base URL is not a valid URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, reason: 'The public API base URL must use http(s).' };
  }
  if (url.username || url.password) {
    return { valid: false, reason: 'The public API base URL must not contain credentials.' };
  }
  if (url.search || url.hash) {
    return { valid: false, reason: 'The public API base URL must not contain a query or fragment.' };
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === 'api' ||
    hostname.endsWith('.local') ||
    hostname === '::1' ||
    PRIVATE_IPV4.test(hostname)
  ) {
    return {
      valid: false,
      reason:
        'The public API base URL must be reachable by a customer browser, not localhost, a Compose service name, or a private address.',
    };
  }
  return { valid: true, reason: null };
}

export function buildPublicMediaUrl(
  publicApiBaseUrl: string,
  mediaId: string,
): string {
  return `${publicApiBaseUrl.replace(/\/+$/, '')}/catalog/merch-media/${mediaId}`;
}
