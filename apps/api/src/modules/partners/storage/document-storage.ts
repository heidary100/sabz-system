/**
 * Partner-domain-scoped document storage abstraction.
 *
 * Business document metadata lives in PostgreSQL; the binary contents live
 * behind this abstraction. The Partner business logic (SS-039+) depends only
 * on `DocumentStorage`, so an object-storage provider can replace the local
 * disk implementation without touching Partner code.
 */
export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');

export interface DocumentStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Raised by get() when the stored object does not exist. */
export class DocumentNotFoundError extends Error {
  constructor(key: string) {
    super(`Document not found for storage key: ${key}`);
    this.name = 'DocumentNotFoundError';
  }
}

/** Raised when a storage key is rejected by the security rules. */
export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Storage key is not allowed: ${key}`);
    this.name = 'InvalidStorageKeyError';
  }
}
