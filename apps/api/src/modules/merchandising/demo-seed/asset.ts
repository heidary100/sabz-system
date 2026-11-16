import { createHash } from 'crypto';
import { constants as fsConstants } from 'fs';
import { lstat, open, realpath, writeFile } from 'fs/promises';
import { isAbsolute, relative, resolve } from 'path';
import { DEMO_MAX_ASSET_BYTES } from './constants';
import type { DemoSeedAssetState } from './types';

export class AssetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetValidationError';
  }
}

function noFollowFlag(): number {
  return fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
}

function missingState(root: string, fileName: string): DemoSeedAssetState {
  return {
    path: resolve(root, fileName),
    exists: false,
    sizeBytes: null,
    sha256: null,
    error: null,
  };
}

/**
 * Resolves an asset inside the approved root without following symlinks at the
 * file or any parent directory. The file is opened once and hashed from that
 * handle so planning content matches the file that will be copied.
 */
export async function inspectAsset(
  root: string,
  fileName: string,
): Promise<DemoSeedAssetState> {
  if (
    fileName.trim() === '' ||
    isAbsolute(fileName) ||
    fileName.includes('\0') ||
    fileName.split(/[\\/]/).includes('..')
  ) {
    return {
      ...missingState(root, fileName),
      error: 'Asset filename must be a relative path contained in the root.',
    };
  }

  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch (error) {
    if (isMissing(error)) return missingState(root, fileName);
    return {
      ...missingState(root, fileName),
      error: `Asset root cannot be resolved: ${errorMessage(error)}`,
    };
  }

  const candidate = resolve(realRoot, fileName);
  const rel = relative(realRoot, candidate);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return {
      ...missingState(realRoot, fileName),
      error: 'Asset path escapes the approved root.',
    };
  }

  try {
    const linkInfo = await lstat(candidate);
    if (linkInfo.isSymbolicLink()) {
      return {
        path: candidate,
        exists: false,
        sizeBytes: null,
        sha256: null,
        error: 'Symbolic links are not accepted as demo assets.',
      };
    }
    if (!linkInfo.isFile()) {
      return {
        path: candidate,
        exists: false,
        sizeBytes: null,
        sha256: null,
        error: 'Demo assets must be regular files.',
      };
    }
    const canonical = await realpath(candidate);
    if (canonical !== candidate) {
      return {
        path: candidate,
        exists: false,
        sizeBytes: null,
        sha256: null,
        error: 'Symlinked asset parents are not accepted.',
      };
    }
    if (linkInfo.size > DEMO_MAX_ASSET_BYTES) {
      return {
        path: candidate,
        exists: false,
        sizeBytes: linkInfo.size,
        sha256: null,
        error: `Asset exceeds the ${DEMO_MAX_ASSET_BYTES}-byte limit.`,
      };
    }

    const handle = await open(candidate, noFollowFlag());
    try {
      const info = await handle.stat();
      if (!info.isFile()) {
        return {
          path: candidate,
          exists: false,
          sizeBytes: null,
          sha256: null,
          error: 'Demo assets must be regular files.',
        };
      }
      if (info.size > DEMO_MAX_ASSET_BYTES) {
        return {
          path: candidate,
          exists: false,
          sizeBytes: info.size,
          sha256: null,
          error: `Asset exceeds the ${DEMO_MAX_ASSET_BYTES}-byte limit.`,
        };
      }
      const contents = await handle.readFile();
      const sha256 = createHash('sha256').update(contents).digest('hex');
      return {
        path: candidate,
        exists: true,
        sizeBytes: contents.byteLength,
        sha256,
        error: null,
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (isMissing(error)) return missingState(realRoot, fileName);
    return {
      ...missingState(realRoot, fileName),
      error: `Asset cannot be inspected safely: ${errorMessage(error)}`,
    };
  }
}

/**
 * Copies the planned asset only after re-reading the same opened file and
 * matching size and SHA-256. `O_NOFOLLOW` is applied to the final component;
 * parent-directory replacement between planning and apply remains a documented
 * residual platform limitation.
 */
export async function copyVerifiedAsset(
  asset: DemoSeedAssetState,
  destination: string,
): Promise<void> {
  if (
    !asset.exists ||
    asset.sizeBytes === null ||
    asset.sha256 === null ||
    asset.error !== null
  ) {
    throw new AssetValidationError(
      `Asset ${asset.path} was not valid at planning time.`,
    );
  }

  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(asset.path, noFollowFlag());
    const info = await handle.stat();
    if (!info.isFile() || info.size !== asset.sizeBytes) {
      throw new AssetValidationError(
        `Asset ${asset.path} changed size after planning.`,
      );
    }
    const contents = await handle.readFile();
    const hash = createHash('sha256').update(contents).digest('hex');
    if (contents.byteLength !== asset.sizeBytes || hash !== asset.sha256) {
      throw new AssetValidationError(
        `Asset ${asset.path} changed content after planning.`,
      );
    }
    await writeFile(destination, contents, {
      flag: 'wx',
      mode: 0o600,
    });
  } finally {
    if (handle !== null) {
      await handle.close();
    }
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
