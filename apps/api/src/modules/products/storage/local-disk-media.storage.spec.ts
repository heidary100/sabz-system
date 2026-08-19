import { access, mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  InvalidMediaStorageKeyError,
  MediaNotFoundError,
} from './product-media-storage';
import { LocalDiskMediaStorage } from './local-disk-media.storage';

describe('LocalDiskMediaStorage', () => {
  let root: string;
  let storage: LocalDiskMediaStorage;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'product-media-'));
    storage = new LocalDiskMediaStorage(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates the storage root on construction', async () => {
    await expect(access(root)).resolves.toBeUndefined();
  });

  it('round-trips media through put and get', async () => {
    const key = 'products/product-1/media-1.jpg';
    const contents = Buffer.from('binary-media-contents');

    await storage.put(key, contents);

    await expect(storage.get(key)).resolves.toEqual(contents);
  });

  it('leaves no temporary files behind after put', async () => {
    const key = 'products/atomic-product/atomic-media.jpg';

    await storage.put(key, Buffer.from('atomic'));

    const entries = await readdir(join(root, 'products', 'atomic-product'));
    expect(entries).toEqual(['atomic-media.jpg']);
  });

  it('throws MediaNotFoundError when the media does not exist', async () => {
    await expect(storage.get('products/product-1/missing.jpg')).rejects.toBeInstanceOf(
      MediaNotFoundError,
    );
  });

  it('delete is idempotent for existing and missing media', async () => {
    const key = 'products/product-1/to-delete.jpg';
    await storage.put(key, Buffer.from('bye'));

    await expect(storage.delete(key)).resolves.toBeUndefined();
    await expect(storage.delete(key)).resolves.toBeUndefined();
    await expect(storage.get(key)).rejects.toBeInstanceOf(MediaNotFoundError);
  });

  it('rejects keys containing parent-directory traversal', async () => {
    await expect(storage.put('../escape.jpg', Buffer.from('x'))).rejects.toBeInstanceOf(
      InvalidMediaStorageKeyError,
    );
    await expect(
      storage.put('products/../../escape.jpg', Buffer.from('x')),
    ).rejects.toBeInstanceOf(InvalidMediaStorageKeyError);
  });

  it('rejects root-escape keys that would resolve outside the storage root', async () => {
    await expect(
      storage.put('products/product-1/../../escape.jpg', Buffer.from('x')),
    ).rejects.toBeInstanceOf(InvalidMediaStorageKeyError);
    await expect(
      storage.get('../../etc/passwd'),
    ).rejects.toBeInstanceOf(InvalidMediaStorageKeyError);
  });

  it('rejects drive-relative keys via the containment check on Windows', async () => {
    const key = 'x:y';
    if (process.platform === 'win32') {
      await expect(storage.put(key, Buffer.from('x'))).rejects.toBeInstanceOf(
        InvalidMediaStorageKeyError,
      );
      await expect(storage.get(key)).rejects.toBeInstanceOf(InvalidMediaStorageKeyError);
      return;
    }
    await expect(storage.put(key, Buffer.from('x'))).resolves.toBeUndefined();
    await expect(storage.get(key)).resolves.toEqual(Buffer.from('x'));
  });

  it('rejects absolute path keys', async () => {
    await expect(storage.put('/etc/passwd', Buffer.from('x'))).rejects.toBeInstanceOf(
      InvalidMediaStorageKeyError,
    );
  });

  it('rejects keys containing backslashes', async () => {
    await expect(
      storage.put('products\\escape.jpg', Buffer.from('x')),
    ).rejects.toBeInstanceOf(InvalidMediaStorageKeyError);
  });

  it('rejects keys containing NUL bytes', async () => {
    await expect(storage.put('products/esc\0ape.jpg', Buffer.from('x'))).rejects.toBeInstanceOf(
      InvalidMediaStorageKeyError,
    );
  });

  it('rejects empty keys', async () => {
    await expect(storage.put('', Buffer.from('x'))).rejects.toBeInstanceOf(
      InvalidMediaStorageKeyError,
    );
    await expect(storage.get('')).rejects.toBeInstanceOf(InvalidMediaStorageKeyError);
  });

  it('creates and uses a nested storage root', async () => {
    const nestedRoot = join(root, 'nested');
    const nested = new LocalDiskMediaStorage(nestedRoot);
    const key = 'products/product-1/media.jpg';
    const contents = Buffer.from('nested-root-media');

    await nested.put(key, contents);

    await expect(nested.get(key)).resolves.toEqual(contents);
    await expect(access(join(nestedRoot, 'products', 'product-1', 'media.jpg'))).resolves.toBeUndefined();
  });

  it('round-trips a server-generated key with a safe extension', async () => {
    const key = `products/${'a'.repeat(36)}/${'b'.repeat(36)}.jpg`;
    const contents = Buffer.from('generated-key-media');

    await storage.put(key, contents);

    await expect(storage.get(key)).resolves.toEqual(contents);
  });
});
