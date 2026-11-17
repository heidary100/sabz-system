import { createHash } from 'crypto';
import type { ProductMediaStorage } from '../../products/storage/product-media-storage';
import { MediaStorageConflictError } from '../media/idempotent-media-storage';

export interface StoredMediaProvenanceRow {
  id: string;
  storageKey: string;
  thumbnailKey: string | null;
  sizeBytes: number;
  sourceSha256: string | null;
  processedSha256: string | null;
  thumbnailSha256: string | null;
}

export interface ApprovedMediaAsset {
  exists?: boolean;
  sha256: string | null;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Verifies that a persisted demo media row is the exact approved artifact.
 * Fails closed on missing source identity, missing/mismatched artifact hashes,
 * missing storage objects, or size mismatch. Never deletes or replaces bytes.
 */
export async function assertStoredMediaProvenance(
  storage: Pick<ProductMediaStorage, 'get'>,
  row: StoredMediaProvenanceRow,
  asset: ApprovedMediaAsset,
): Promise<void> {
  if (
    asset.exists === false ||
    asset.sha256 === null ||
    row.sourceSha256 !== asset.sha256
  ) {
    throw new MediaStorageConflictError(
      row.storageKey,
      `Media ${row.id} provenance does not match the approved source asset. Refusing to reuse prior content; inspect or remove the row manually.`,
    );
  }
  if (row.processedSha256 === null) {
    throw new MediaStorageConflictError(
      row.storageKey,
      `Media ${row.id} has no recorded processed-artifact hash. Refusing to reuse it.`,
    );
  }
  let storedMain: Buffer;
  try {
    storedMain = await storage.get(row.storageKey);
  } catch {
    throw new MediaStorageConflictError(
      row.storageKey,
      `Media ${row.id} is owned by the demo seed but its main binary is missing; refusing to reuse it.`,
    );
  }
  if (
    storedMain.byteLength !== row.sizeBytes ||
    sha256(storedMain) !== row.processedSha256
  ) {
    throw new MediaStorageConflictError(
      row.storageKey,
      `Media ${row.id} main binary does not match its recorded processed hash. Refusing to reuse it; the object was not deleted.`,
    );
  }
  if (row.thumbnailKey === null || row.thumbnailSha256 === null) {
    throw new MediaStorageConflictError(
      row.storageKey,
      `Media ${row.id} is missing verified thumbnail provenance. Refusing to reuse it.`,
    );
  }
  let storedThumb: Buffer;
  try {
    storedThumb = await storage.get(row.thumbnailKey);
  } catch {
    throw new MediaStorageConflictError(
      row.thumbnailKey,
      `Media ${row.id} is owned by the demo seed but its thumbnail binary is missing; refusing to reuse it.`,
    );
  }
  if (sha256(storedThumb) !== row.thumbnailSha256) {
    throw new MediaStorageConflictError(
      row.thumbnailKey,
      `Media ${row.id} thumbnail does not match its recorded hash. Refusing to reuse it; the object was not deleted.`,
    );
  }
}
