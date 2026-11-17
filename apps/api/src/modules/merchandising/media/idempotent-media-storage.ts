import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import {
  MediaNotFoundError,
  type ProductMediaStorage,
} from '../../products/storage/product-media-storage';

export class MediaStorageConflictError extends Error {
  constructor(readonly key: string, reason?: string) {
    super(
      reason ??
        `Storage key ${key} already contains different bytes; refusing to overwrite or reuse it. Manual inspection is required.`,
    );
    this.name = 'MediaStorageConflictError';
  }
}

export type StorageWriteAction = 'written' | 'reused-verified';

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof MediaNotFoundError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'MediaNotFoundError')
  );
}

function sameBytes(left: Buffer, right: Buffer): boolean {
  return (
    left.byteLength === right.byteLength && sha256(left) === sha256(right)
  );
}

/**
 * Writes a file to a deterministic key without ever replacing different
 * content. An existing object is reused only when its bytes exactly match the
 * freshly produced source. A mismatch fails closed and the object is retained
 * for manual inspection.
 *
 * `putFileExclusive` is used when the adapter supports atomic create-if-absent,
 * so a concurrent writer cannot be overwritten between the existence check and
 * the write. Adapters without it keep the check-then-write behavior and the
 * residual race is documented by the caller.
 */
export async function storeFileIdempotently(
  storage: ProductMediaStorage,
  key: string,
  sourcePath: string,
): Promise<StorageWriteAction> {
  const source = await readFile(sourcePath);

  const readExisting = async (): Promise<Buffer | null> => {
    try {
      return await storage.get(key);
    } catch (error) {
      if (isMissing(error)) return null;
      throw new MediaStorageConflictError(
        key,
        `Storage key ${key} exists but cannot be read or verified: ${
          error instanceof Error ? error.message : String(error)
        }. Manual recovery is required; the object was not deleted.`,
      );
    }
  };

  const existing = await readExisting();
  if (existing !== null) {
    if (!sameBytes(existing, source)) {
      throw new MediaStorageConflictError(key);
    }
    return 'reused-verified';
  }

  if (storage.putFileExclusive) {
    const created = await storage.putFileExclusive(key, sourcePath);
    if (!created) {
      const raced = await readExisting();
      if (raced === null || !sameBytes(raced, source)) {
        throw new MediaStorageConflictError(key);
      }
      return 'reused-verified';
    }
  } else {
    await storage.putFile(key, sourcePath);
  }

  const stored = await readExisting();
  if (stored === null || !sameBytes(stored, source)) {
    throw new MediaStorageConflictError(
      key,
      `Storage key ${key} did not contain the expected bytes after writing. Manual recovery is required; the object was not deleted.`,
    );
  }
  return 'written';
}
