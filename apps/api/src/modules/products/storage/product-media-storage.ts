import type { Readable } from 'stream';

/**
 * Product-domain-scoped media storage abstraction (SS-105).
 *
 * Product media metadata lives in PostgreSQL; the binary contents live behind
 * this abstraction. The Product media business logic depends only on
 * `ProductMediaStorage`, so an object-storage provider can replace the local
 * disk implementation without touching Product code.
 *
 * This is intentionally a *separate* abstraction from the Partner-domain
 * `DocumentStorage` (SS-038/SS-039): partner business documents and product
 * media (which will eventually be publicly consumable by the storefront) have
 * different security and lifecycle semantics, and the SS-100 schema note
 * records this product-specific storage boundary. The abstraction exposes only
 * `put`/`get`/`delete` in M1; no public-URL or signed-URL generation exists
 * yet (storefront/public delivery is out of SS-105 scope).
 */
export const PRODUCT_MEDIA_STORAGE = Symbol('PRODUCT_MEDIA_STORAGE');

export interface ProductMediaStorage {
  put(key: string, data: Buffer): Promise<void>;
  /**
   * Moves/copies a local file into storage under `key`. Used by the media
   * pipeline to store the processed (watermarked) asset without buffering a
   * large file into memory.
   */
  putFile(key: string, sourcePath: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Streams a stored object for download without buffering it in memory. */
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

/** Raised by get() when the stored object does not exist. */
export class MediaNotFoundError extends Error {
  constructor(key: string) {
    super(`Media not found for storage key: ${key}`);
    this.name = 'MediaNotFoundError';
  }
}

/** Raised when a storage key is rejected by the security rules. */
export class InvalidMediaStorageKeyError extends Error {
  constructor(key: string) {
    super(`Media storage key is not allowed: ${key}`);
    this.name = 'InvalidMediaStorageKeyError';
  }
}
