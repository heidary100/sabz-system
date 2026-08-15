import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import {
  DocumentNotFoundError,
  DocumentStorage,
  InvalidStorageKeyError,
} from './document-storage';

const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;

/**
 * Stores document binaries on the local filesystem under a configured root.
 *
 * Keys are server-generated (e.g. `partners/<partnerId>/<documentId>.pdf`)
 * and are never derived from user-provided filenames. Every key is validated,
 * lexically resolved, and verified to stay inside the storage root.
 *
 * Containment is lexical (`path.resolve`); symlinks inside the root that point
 * outside it are not resolved. This is acceptable because keys are
 * server-generated UUIDs and paths are never exposed, but it is a hardening
 * boundary, not a cryptographic one.
 */
export class LocalDiskStorage implements DocumentStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
    // Fail fast at startup: a storage root that cannot be created would
    // otherwise surface later at the first write.
    mkdirSync(this.root, { recursive: true });
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.resolveKey(key);
    await mkdir(dirname(target), { recursive: true });
    // Write to a temporary sibling then rename: readers never observe a
    // partially-written file, and a crash cannot leave truncated data at the
    // final storageKey path. rename() atomically replaces an existing
    // destination on POSIX and on Windows (MOVEFILE_REPLACE_EXISTING), except
    // on Windows when another handle holds the destination open.
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, data);
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async get(key: string): Promise<Buffer> {
    const target = this.resolveKey(key);
    try {
      return await readFile(target);
    } catch (error) {
      if (this.isMissing(error)) {
        throw new DocumentNotFoundError(key);
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const target = this.resolveKey(key);
    // force: true makes deletion idempotent for missing files.
    await rm(target, { force: true });
  }

  /**
   * Validates a storage key and resolves it to an absolute path inside the
   * storage root. Rejects traversal, absolute paths, backslashes, and NUL
   * bytes; the final resolved path must remain inside the root.
   */
  private resolveKey(key: string): string {
    if (!key || key.length === 0) {
      throw new InvalidStorageKeyError(key);
    }
    if (key.includes('..')) {
      throw new InvalidStorageKeyError(key);
    }
    if (key.startsWith('/') || WINDOWS_ABSOLUTE_PATH.test(key)) {
      throw new InvalidStorageKeyError(key);
    }
    if (key.includes('\\')) {
      throw new InvalidStorageKeyError(key);
    }
    if (key.includes('\0')) {
      throw new InvalidStorageKeyError(key);
    }

    const resolved = resolve(this.root, key);
    const insideRoot =
      resolved === this.root || resolved.startsWith(this.root + sep);
    if (!insideRoot) {
      throw new InvalidStorageKeyError(key);
    }
    return resolved;
  }

  private isMissing(error: unknown): boolean {
    // Duck-typed on purpose: fs errors can fail `instanceof Error` inside the
    // Jest sandbox, so relying on the prototype chain is not portable.
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
}
