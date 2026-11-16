import { statfsSync } from 'fs';
import { link, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalDiskMediaStorage } from '../src/modules/products/storage/local-disk-media.storage';
import { MediaNotFoundError } from '../src/modules/products/storage/product-media-storage';
import {
  MediaStorageConflictError,
  storeFileIdempotently,
} from '../src/modules/merchandising/media/idempotent-media-storage';

/**
 * Isolated storage coverage. Uses only a temporary directory; never the
 * Compose media volume or the shared development environment.
 *
 * Not executed by the ordinary unit command and not executed during the
 * remediation task.
 */
describe('demo seed isolated storage integration', () => {
  let root: string;
  let storage: LocalDiskMediaStorage;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'demo-seed-storage-'));
    storage = new LocalDiskMediaStorage(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores, streams and deletes an operation-prefixed asset', async () => {
    const source = join(root, 'source.jpg');
    const key = 'merchandising/demo/integration/asset-1.jpg';
    await writeFile(source, Buffer.from('storage-integration'));
    await storage.putFile(key, source);
    const stream = await storage.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString()).toBe('storage-integration');
    await storage.delete(key);
    await expect(storage.getStream(key)).rejects.toBeInstanceOf(
      MediaNotFoundError,
    );
  });

  it('reports a missing binary instead of fabricating one', async () => {
    await expect(
      storage.getStream('merchandising/demo/integration/missing.jpg'),
    ).rejects.toBeInstanceOf(MediaNotFoundError);
  });

  it('does not accept traversal storage keys', async () => {
    await expect(storage.put('../../outside.jpg', Buffer.from('x'))).rejects.toThrow();
  });

  it('reuses an identical deterministic key without rewriting it', async () => {
    const source = join(root, 'idempotent-source.jpg');
    const key = 'merchandising/demo/integration/idempotent.jpg';
    await writeFile(source, Buffer.from('identical-bytes'));
    await expect(
      storeFileIdempotently(storage, key, source),
    ).resolves.toBe('written');
    const first = await storage.get(key);
    await expect(
      storeFileIdempotently(storage, key, source),
    ).resolves.toBe('reused-verified');
    expect(await storage.get(key)).toEqual(first);
  });

  it('fails closed when a deterministic key contains different bytes', async () => {
    const original = join(root, 'conflict-original.jpg');
    const changed = join(root, 'conflict-changed.jpg');
    const key = 'merchandising/demo/integration/conflict.jpg';
    await writeFile(original, Buffer.from('original-bytes'));
    await writeFile(changed, Buffer.from('different-bytes'));
    await storeFileIdempotently(storage, key, original);
    await expect(
      storeFileIdempotently(storage, key, changed),
    ).rejects.toBeInstanceOf(MediaStorageConflictError);
    expect((await storage.get(key)).toString()).toBe('original-bytes');
  });

  it('detects a crash orphan and reuses it after verification', async () => {
    const source = join(root, 'orphan-source.jpg');
    const key = 'merchandising/demo/integration/orphan.jpg';
    await writeFile(source, Buffer.from('orphan-bytes'));
    // Simulate a crash after the binary write but before the media row.
    await storage.putFile(key, source);
    await expect(
      storeFileIdempotently(storage, key, source),
    ).resolves.toBe('reused-verified');
    expect((await storage.get(key)).toString()).toBe('orphan-bytes');
  });

  it('does not delete ambiguous binaries on conflict', async () => {
    const original = join(root, 'ambiguous-original.jpg');
    const changed = join(root, 'ambiguous-changed.jpg');
    const key = 'merchandising/demo/integration/ambiguous.jpg';
    await writeFile(original, Buffer.from('keep-me'));
    await writeFile(changed, Buffer.from('other'));
    await storeFileIdempotently(storage, key, original);
    await expect(
      storeFileIdempotently(storage, key, changed),
    ).rejects.toBeInstanceOf(MediaStorageConflictError);
    expect(await readFile(join(root, key), 'utf8')).toBe('keep-me');
  });

  it('fails closed when atomic hard-link creation is unavailable', async () => {
    const source = join(root, 'no-hard-link-source.jpg');
    const key = 'merchandising/demo/integration/no-hard-link.jpg';
    await writeFile(source, Buffer.from('must-not-be-lost'));
    // Simulate a real filesystem that does not implement hard links while
    // retaining the real local-disk adapter for every other operation.
    const noHardLinks = {
      put: (storageKey: string, data: Buffer) => storage.put(storageKey, data),
      putFile: (storageKey: string, sourcePath: string) =>
        storage.putFile(storageKey, sourcePath),
      putFileExclusive: async () => {
        const error = new Error(
          'hard links are not supported by this filesystem',
        );
        (error as NodeJS.ErrnoException).code = 'EOPNOTSUPP';
        throw error;
      },
      get: (storageKey: string) => storage.get(storageKey),
      getStream: (storageKey: string) => storage.getStream(storageKey),
      delete: (storageKey: string) => storage.delete(storageKey),
    };

    await expect(
      storeFileIdempotently(noHardLinks, key, source),
    ).rejects.toMatchObject({ code: 'EOPNOTSUPP' });
    await expect(storage.get(key)).rejects.toBeInstanceOf(MediaNotFoundError);
    expect(await readFile(source, 'utf8')).toBe('must-not-be-lost');
  });

  const linklessRoot = process.env.DEMO_SEED_LINKLESS_STORAGE_ROOT;
  const linklessTest = linklessRoot ? it : it.skip;
  linklessTest(
    'fails closed on a mounted real filesystem that rejects hard links',
    async () => {
      const root = linklessRoot!;
      // 0x4d44 is MSDOS_SUPER_MAGIC; the evidence run mounts a disposable
      // FAT/vfat image. Skip rather than silently use an overlay/tmpfs.
      expect(statfsSync(root).type).toBe(0x4d44);

      const source = join(root, 'real-linkless-source.jpg');
      const target = join(root, 'real-linkless-target.jpg');
      const bytes = 'real-vfat-must-not-be-lost';
      await writeFile(source, Buffer.from(bytes));

      const allowedCodes = /^(EPERM|EOPNOTSUPP|ENOTSUP|ENOSYS)$/;
      await expect(link(source, target)).rejects.toMatchObject({
        code: expect.stringMatching(allowedCodes),
      });
      await expect(readFile(target, 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });

      const realStorage = new LocalDiskMediaStorage(root);
      const key = 'merchandising/demo/integration/real-linkless.jpg';
      await expect(
        storeFileIdempotently(realStorage, key, source),
      ).rejects.toMatchObject({
        code: expect.stringMatching(allowedCodes),
      });
      await expect(realStorage.get(key)).rejects.toBeInstanceOf(
        MediaNotFoundError,
      );
      expect(await readFile(source, 'utf8')).toBe(bytes);
      await rm(source, { force: true });
    },
  );
});
