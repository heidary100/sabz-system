import { createHash } from 'crypto';
import type { DemoMediaAssetDefinition } from './types';

function operationSegment(operationId: string): string {
  return createHash('sha256').update(operationId).digest('hex').slice(0, 20);
}

function extensionFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Storage keys are attributable to the operation so a journal row created
 * before upload can identify a crash-orphaned binary without scanning unrelated
 * merchandising media.
 */
export function assertMediaAssetKey(key: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(key)) {
    throw new Error(
      `Demo media key ${key} is not a safe storage path segment.`,
    );
  }
  return key;
}

export function demoMediaStorageKeys(
  operationId: string,
  asset: DemoMediaAssetDefinition,
): { storageKey: string; thumbnailKey: string } {
  assertMediaAssetKey(asset.key);
  const base = `merchandising/demo/${operationSegment(operationId)}/${asset.key}`;
  return {
    storageKey: `${base}.${extensionFor(asset.mimeType)}`,
    thumbnailKey: `${base}.thumb.webp`,
  };
}
