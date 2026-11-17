import { createHash } from 'crypto';
import {
  assertStoredMediaProvenance,
  type StoredMediaProvenanceRow,
} from './media-provenance';
import { MediaStorageConflictError } from '../media/idempotent-media-storage';

const sourceSha = 'a'.repeat(64);
const main = Buffer.from('processed-main');
const thumb = Buffer.from('processed-thumb');
const mainSha = createHash('sha256').update(main).digest('hex');
const thumbSha = createHash('sha256').update(thumb).digest('hex');

function row(
  overrides: Partial<StoredMediaProvenanceRow> = {},
): StoredMediaProvenanceRow {
  return {
    id: 'media-1',
    storageKey: 'merchandising/demo/op/asset.jpg',
    thumbnailKey: 'merchandising/demo/op/asset.thumb.webp',
    sizeBytes: main.byteLength,
    sourceSha256: sourceSha,
    processedSha256: mainSha,
    thumbnailSha256: thumbSha,
    ...overrides,
  };
}

function storage(overrides: Record<string, Buffer> = {}) {
  const objects: Record<string, Buffer> = {
    'merchandising/demo/op/asset.jpg': main,
    'merchandising/demo/op/asset.thumb.webp': thumb,
    ...overrides,
  };
  return {
    async get(key: string): Promise<Buffer> {
      const value = objects[key];
      if (value === undefined) throw new Error('missing');
      return value;
    },
  };
}

describe('homepage demo seed media provenance', () => {
  it('accepts only matching source and stored artifact bytes', async () => {
    await expect(
      assertStoredMediaProvenance(storage(), row(), {
        exists: true,
        sha256: sourceSha,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects a missing approved source asset', async () => {
    await expect(
      assertStoredMediaProvenance(storage(), row(), {
        exists: false,
        sha256: sourceSha,
      }),
    ).rejects.toBeInstanceOf(MediaStorageConflictError);
  });

  it('rejects a changed source hash', async () => {
    await expect(
      assertStoredMediaProvenance(storage(), row(), {
        exists: true,
        sha256: 'b'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(MediaStorageConflictError);
  });

  it('rejects a missing processed provenance hash', async () => {
    await expect(
      assertStoredMediaProvenance(
        storage(),
        row({ processedSha256: null }),
        { exists: true, sha256: sourceSha },
      ),
    ).rejects.toBeInstanceOf(MediaStorageConflictError);
  });

  it('rejects mismatched stored main bytes or size', async () => {
    await expect(
      assertStoredMediaProvenance(
        storage({ 'merchandising/demo/op/asset.jpg': Buffer.from('other') }),
        row(),
        { exists: true, sha256: sourceSha },
      ),
    ).rejects.toBeInstanceOf(MediaStorageConflictError);
    await expect(
      assertStoredMediaProvenance(
        storage(),
        row({ sizeBytes: main.byteLength + 1 }),
        { exists: true, sha256: sourceSha },
      ),
    ).rejects.toBeInstanceOf(MediaStorageConflictError);
  });

  it('rejects missing or mismatched thumbnail provenance and bytes', async () => {
    await expect(
      assertStoredMediaProvenance(
        storage(),
        row({ thumbnailKey: null, thumbnailSha256: null }),
        { exists: true, sha256: sourceSha },
      ),
    ).rejects.toBeInstanceOf(MediaStorageConflictError);
    await expect(
      assertStoredMediaProvenance(
        storage({
          'merchandising/demo/op/asset.thumb.webp': Buffer.from('other-thumb'),
        }),
        row(),
        { exists: true, sha256: sourceSha },
      ),
    ).rejects.toBeInstanceOf(MediaStorageConflictError);
  });

  it('rejects missing storage objects without deleting anything', async () => {
    const objects = storage();
    await expect(
      assertStoredMediaProvenance(
        {
          async get(key: string) {
            if (key.endsWith('.jpg')) throw new Error('missing');
            return objects.get(key);
          },
        },
        row(),
        { exists: true, sha256: sourceSha },
      ),
    ).rejects.toBeInstanceOf(MediaStorageConflictError);
  });
});
