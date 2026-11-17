import { createHash, randomUUID } from 'crypto';
import { constants as fsConstants } from 'fs';
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  realpath,
  unlink,
} from 'fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { MERCH_HOMEPAGE_SCHEMA_VERSION } from '@sabz/types';
import {
  BACKUP_DIR_MODE,
  BACKUP_FILE_MODE,
  BACKUP_FORMAT_VERSION,
} from './constants';
import { computeDatabaseFingerprint } from './identity';
import { assertOperationId } from './operation-id';
import { validateHomepageDraftSections } from '../homepage-section-validation';
import type { DatabaseIdentity, DemoDraftSnapshot } from './types';

export class BackupExistsError extends Error {
  constructor(path: string) {
    super(`Backup already exists and will not be overwritten: ${path}`);
    this.name = 'BackupExistsError';
  }
}

export interface BackupFsStat {
  mode: number;
  uid: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
}

export interface BackupFileHandle {
  writeFile(data: string, encoding: BufferEncoding): Promise<void>;
  readFile?(encoding: BufferEncoding): Promise<string>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface BackupFs {
  mkdir(path: string, options: { recursive: boolean; mode: number }): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  open(path: string, flags: string | number, mode: number): Promise<BackupFileHandle>;
  lstat(path: string): Promise<BackupFsStat>;
  realpath(path: string): Promise<string>;
  openDirectory(path: string): Promise<BackupFileHandle>;
  link(existingPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

const nodeFs: BackupFs = {
  mkdir: async (path, options) => {
    await mkdir(path, options);
  },
  chmod: async (path, mode) => {
    await chmod(path, mode);
  },
  open: async (path, flags, mode) => open(path, flags, mode),
  lstat: async (path) => {
    const info = await lstat(path);
    return {
      mode: info.mode & 0o777,
      uid: info.uid,
      isFile: info.isFile(),
      isDirectory: info.isDirectory(),
      isSymbolicLink: info.isSymbolicLink(),
    };
  },
  realpath: async (path) => realpath(path),
  openDirectory: async (path) => open(path, 'r'),
  link: async (existingPath, newPath) => {
    await link(existingPath, newPath);
  },
  unlink: async (path) => {
    await unlink(path);
  },
};

export interface DraftBackupPayload {
  formatVersion: number;
  operationId: string;
  createdAt: string;
  identity: DatabaseIdentity;
  draft: DemoDraftSnapshot;
}

export interface DraftBackupEnvelope {
  formatVersion: number;
  checksumAlgorithm: 'sha256';
  checksum: string;
  payload: DraftBackupPayload;
}

export interface DraftBackupResult {
  path: string;
  checksum: string;
  sizeBytes: number;
}

export interface CreateDraftBackupOptions {
  backupDir: string;
  identity: DatabaseIdentity;
  draft: DemoDraftSnapshot;
  operationId: string;
  now?: Date;
  fs?: BackupFs;
  expectedUid?: number;
}

/**
 * Canonical JSON for checksums and equality. Object keys are sorted so a
 * read-back parse cannot produce a different hash because of key order.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

export function checksumPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

function timestampPart(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function currentUid(): number | null {
  return typeof process.getuid === 'function' ? process.getuid() : null;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

async function fsyncDirectory(
  fs: BackupFs,
  directory: string,
): Promise<void> {
  let handle: BackupFileHandle | null = null;
  try {
    handle = await fs.openDirectory(directory);
    await handle.sync();
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null
        ? (error as NodeJS.ErrnoException).code
        : undefined;
    // Directory fsync is not supported on every platform/filesystem.
    if (
      code === 'EINVAL' ||
      code === 'ENOTSUP' ||
      code === 'EBADF' ||
      code === 'EPERM'
    ) {
      return;
    }
    throw error;
  } finally {
    if (handle !== null) {
      await handle.close().catch(() => undefined);
    }
  }
}

/**
 * Rejects a path whose existing components include a symbolic link. The final
 * root must also resolve to its own lexical path, so a parent swap cannot
 * redirect a backup outside the operator-approved directory.
 */
async function assertNoSymlinkComponents(
  path: string,
  fs: BackupFs,
): Promise<void> {
  const absolute = resolve(path);
  const parts = absolute.split(sep).filter((part) => part.length > 0);
  let current = absolute.startsWith(sep) ? sep : '';
  for (const part of parts) {
    current = join(current, part);
    try {
      const info = await fs.lstat(current);
      if (info.isSymbolicLink) {
        throw new Error(
          `Backup path traverses a symbolic link: ${current}`,
        );
      }
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
  }
}

async function prepareBackupRoot(
  root: string,
  fs: BackupFs,
  create: boolean,
  expectedUid: number | null = currentUid(),
): Promise<string> {
  const lexical = resolve(root);
  await assertNoSymlinkComponents(dirname(lexical), fs);

  // Never chmod an existing operator directory: changing a shared directory
  // to 0700 is destructive and can break other services. New roots are
  // created with the required mode; existing roots must already comply.
  let existed = true;
  try {
    await fs.lstat(lexical);
  } catch (error) {
    if (!isMissing(error)) throw error;
    existed = false;
  }
  if (create) {
    await fs.mkdir(lexical, { recursive: true, mode: BACKUP_DIR_MODE });
  }
  const info = await fs.lstat(lexical);
  if (info.isSymbolicLink || !info.isDirectory) {
    throw new Error(
      `Backup root must be a real directory, not a symlink or file: ${lexical}`,
    );
  }
  const canonical = await fs.realpath(lexical);
  if (canonical !== lexical) {
    throw new Error(
      `Backup root resolves through a symbolic link and is not accepted: ${lexical}`,
    );
  }
  if (expectedUid !== null && info.uid !== expectedUid) {
    throw new Error('Backup directory ownership does not match the expected owner.');
  }
  if (existed && info.mode !== BACKUP_DIR_MODE) {
    throw new Error(
      `Existing backup directory permissions are ${info.mode.toString(8)}, expected ${BACKUP_DIR_MODE.toString(8)}; refusing to change an existing directory.`,
    );
  }
  if (!existed) {
    await fs.chmod(canonical, BACKUP_DIR_MODE);
  }
  const finalInfo = await fs.lstat(canonical);
  if (finalInfo.mode !== BACKUP_DIR_MODE) {
    throw new Error(
      `Backup directory permissions are ${finalInfo.mode.toString(8)}, expected ${BACKUP_DIR_MODE.toString(8)}.`,
    );
  }
  if (expectedUid !== null && finalInfo.uid !== expectedUid) {
    throw new Error('Backup directory ownership does not match the expected owner.');
  }
  return canonical;
}

function assertContained(root: string, candidate: string): void {
  const rel = relative(root, candidate);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `Backup path is outside the configured backup root: ${candidate}`,
    );
  }
}

function backupPath(root: string, operationId: string, revision: number, now: Date): string {
  const filename = `homepage-draft-rev-${revision}-${timestampPart(now)}-${operationId}.json`;
  const candidate = resolve(root, filename);
  assertContained(root, candidate);
  return candidate;
}

/**
 * Creates a persistent, exclusive, checksummed draft backup and verifies it by
 * reading it back. Any failure must abort the caller before database mutation.
 */
export async function createDraftBackup(
  options: CreateDraftBackupOptions,
): Promise<DraftBackupResult> {
  const fs = options.fs ?? nodeFs;
  const operationId = assertOperationId(options.operationId);
  const now = options.now ?? new Date();
  const payload: DraftBackupPayload = {
    formatVersion: BACKUP_FORMAT_VERSION,
    operationId,
    createdAt: now.toISOString(),
    identity: options.identity,
    draft: options.draft,
  };
  const checksum = checksumPayload(payload);
  const envelope: DraftBackupEnvelope = {
    formatVersion: BACKUP_FORMAT_VERSION,
    checksumAlgorithm: 'sha256',
    checksum,
    payload,
  };
  if (validateEnvelope(envelope) === null) {
    throw new Error(
      'Refusing to write a backup whose payload is invalid or unsupported.',
    );
  }

  const expectedUid = options.expectedUid ?? currentUid();
  const root = await prepareBackupRoot(
    options.backupDir,
    fs,
    true,
    expectedUid,
  );
  const path = backupPath(root, operationId, options.draft.revision, now);
  try {
    const existing = await fs.lstat(path);
    if (existing.isSymbolicLink || existing.isFile || existing.isDirectory) {
      throw new BackupExistsError(path);
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }

  const serialized = JSON.stringify(envelope, null, 2);
  const temporary = join(root, `.homepage-draft-${randomUUID()}.tmp`);
  const previousUmask = process.umask(0o077);
  let handle: BackupFileHandle | null = null;
  let closed = false;
  try {
    try {
      handle = await fs.open(
        temporary,
        fsConstants.O_WRONLY |
          fsConstants.O_CREAT |
          fsConstants.O_EXCL |
          (fsConstants.O_NOFOLLOW ?? 0),
        BACKUP_FILE_MODE,
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as NodeJS.ErrnoException).code === 'EEXIST'
      ) {
        throw new BackupExistsError(temporary);
      }
      throw error;
    }
    await handle.writeFile(serialized, 'utf8');
    await handle.sync();
    await handle.close();
    closed = true;

    try {
      await fs.link(temporary, path);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as NodeJS.ErrnoException).code === 'EEXIST'
      ) {
        throw new BackupExistsError(path);
      }
      throw error;
    }
  } finally {
    process.umask(previousUmask);
    if (!closed && handle !== null) {
      await handle.close().catch(() => undefined);
    }
    await fs.unlink(temporary).catch(() => undefined);
  }

  await fsyncDirectory(fs, root);

  const fileInfo = await fs.lstat(path);
  if (fileInfo.isSymbolicLink || !fileInfo.isFile) {
    throw new Error(`Backup destination is not a regular file: ${path}`);
  }
  if (fileInfo.mode !== BACKUP_FILE_MODE) {
    throw new Error(
      `Backup file permissions are ${fileInfo.mode.toString(8)}, expected ${BACKUP_FILE_MODE.toString(8)}.`,
    );
  }
  if (expectedUid !== null && fileInfo.uid !== expectedUid) {
    throw new Error('Backup file ownership does not match the current process.');
  }
  const canonical = await fs.realpath(path);
  if (canonical !== path) {
    throw new Error(`Backup path resolves through a symbolic link: ${path}`);
  }

  const verified = await readAndVerifyBackup(path, {
    backupDir: root,
    fs,
    expectedUid,
  });
  if (verified.checksum !== checksum) {
    throw new Error('Backup read-back checksum changed before verification.');
  }

  return {
    path,
    checksum,
    sizeBytes: Buffer.byteLength(serialized, 'utf8'),
  };
}

export interface VerifyBackupOptions {
  /** The operator-configured backup root. Verification never escapes it. */
  backupDir: string;
  fs?: BackupFs;
  expectedUid?: number | null;
}

/** Read a backup and verify its format, identity, payload and checksum. */
export async function readAndVerifyBackup(
  path: string,
  options: VerifyBackupOptions,
): Promise<DraftBackupEnvelope> {
  const fs = options.fs ?? nodeFs;
  const expectedUid =
    options.expectedUid === undefined ? currentUid() : options.expectedUid;
  const root = await prepareBackupRoot(
    options.backupDir,
    fs,
    false,
    expectedUid,
  );
  const candidate = resolve(path);
  assertContained(root, candidate);

  const linkInfo = await fs.lstat(candidate);
  if (linkInfo.isSymbolicLink || !linkInfo.isFile) {
    throw new Error(
      `Backup must be a regular file, not a symlink or directory: ${candidate}`,
    );
  }
  if (linkInfo.mode !== BACKUP_FILE_MODE) {
    throw new Error(
      `Backup file permissions are ${linkInfo.mode.toString(8)}, expected ${BACKUP_FILE_MODE.toString(8)}.`,
    );
  }
  if (expectedUid !== null && linkInfo.uid !== expectedUid) {
    throw new Error('Backup file ownership does not match the expected owner.');
  }
  const canonical = await fs.realpath(candidate);
  if (canonical !== candidate) {
    throw new Error(
      `Backup path resolves through a symbolic link: ${candidate}`,
    );
  }

  let handle: BackupFileHandle | null = null;
  let text: string;
  try {
    handle = await fs.open(
      candidate,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
      BACKUP_FILE_MODE,
    );
    if (!handle.readFile) {
      throw new Error('Backup filesystem adapter cannot read the opened file handle.');
    }
    text = await handle.readFile('utf8');
  } finally {
    if (handle !== null) {
      await handle.close().catch(() => undefined);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Backup is not valid JSON: ${candidate}`);
  }
  const envelope = validateEnvelope(parsed);
  if (envelope === null) {
    throw new Error(`Backup envelope is invalid or unsupported: ${candidate}`);
  }
  const actual = checksumPayload(envelope.payload);
  if (actual !== envelope.checksum) {
    throw new Error(`Backup checksum verification failed: ${candidate}`);
  }
  return envelope;
}

function validIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validateSections(value: unknown): boolean {
  return validateHomepageDraftSections(value).valid;
}

function validateEnvelope(value: unknown): DraftBackupEnvelope | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    record.formatVersion !== BACKUP_FORMAT_VERSION ||
    record.checksumAlgorithm !== 'sha256' ||
    typeof record.checksum !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.checksum)
  ) {
    return null;
  }
  const payload = record.payload;
  if (typeof payload !== 'object' || payload === null) return null;
  const data = payload as Record<string, unknown>;
  if (
    data.formatVersion !== BACKUP_FORMAT_VERSION ||
    typeof data.operationId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(data.operationId) ||
    typeof data.createdAt !== 'string' ||
    !validIsoTimestamp(data.createdAt)
  ) {
    return null;
  }
  const identity = data.identity;
  if (typeof identity !== 'object' || identity === null) return null;
  const id = identity as Record<string, unknown>;
  if (
    typeof id.systemIdentifier !== 'string' ||
    id.systemIdentifier.trim() === '' ||
    typeof id.databaseName !== 'string' ||
    id.databaseName.trim() === '' ||
    typeof id.databaseOid !== 'number' ||
    !Number.isSafeInteger(id.databaseOid) ||
    typeof id.postgresVersion !== 'string' ||
    typeof id.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(id.fingerprint)
  ) {
    return null;
  }
  const computedFingerprint = computeDatabaseFingerprint({
    systemIdentifier: id.systemIdentifier,
    databaseName: id.databaseName,
    databaseOid: id.databaseOid,
  });
  if (computedFingerprint !== id.fingerprint) return null;

  const draft = data.draft;
  if (typeof draft !== 'object' || draft === null) return null;
  const d = draft as Record<string, unknown>;
  if (
    typeof d.revision !== 'number' ||
    !Number.isSafeInteger(d.revision) ||
    d.revision < 0 ||
    d.schemaVersion !== MERCH_HOMEPAGE_SCHEMA_VERSION ||
    !validateSections(d.sections) ||
    typeof d.updatedAt !== 'string' ||
    !validIsoTimestamp(d.updatedAt)
  ) {
    return null;
  }

  return record as unknown as DraftBackupEnvelope;
}

export const backupFs = nodeFs;
