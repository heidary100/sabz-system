import { access, mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  DocumentNotFoundError,
  InvalidStorageKeyError,
} from './document-storage';
import { LocalDiskStorage } from './local-disk.storage';

describe('LocalDiskStorage', () => {
  let root: string;
  let storage: LocalDiskStorage;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'doc-storage-'));
    storage = new LocalDiskStorage(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates the storage root on construction', async () => {
    await expect(access(root)).resolves.toBeUndefined();
  });

  it('round-trips a document through put and get', async () => {
    const key = 'partners/partner-1/document-1.pdf';
    const contents = Buffer.from('binary-document-contents');

    await storage.put(key, contents);

    await expect(storage.get(key)).resolves.toEqual(contents);
  });

  it('leaves no temporary files behind after put', async () => {
    const key = 'partners/atomic-partner/atomic-document.pdf';

    await storage.put(key, Buffer.from('atomic'));

    const entries = await readdir(join(root, 'partners', 'atomic-partner'));
    expect(entries).toEqual(['atomic-document.pdf']);
  });

  it('throws DocumentNotFoundError when the document does not exist', async () => {
    await expect(storage.get('partners/partner-1/missing.pdf')).rejects.toBeInstanceOf(
      DocumentNotFoundError,
    );
  });

  it('delete is idempotent for existing and missing documents', async () => {
    const key = 'partners/partner-1/to-delete.pdf';
    await storage.put(key, Buffer.from('bye'));

    await expect(storage.delete(key)).resolves.toBeUndefined();
    await expect(storage.delete(key)).resolves.toBeUndefined();
    await expect(storage.get(key)).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  it('rejects keys containing parent-directory traversal', async () => {
    await expect(storage.put('../escape.pdf', Buffer.from('x'))).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
    await expect(
      storage.put('partners/../../escape.pdf', Buffer.from('x')),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });

  it('rejects root-escape keys that would resolve outside the storage root', async () => {
    await expect(
      storage.put('partners/partner-1/../../escape.pdf', Buffer.from('x')),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(
      storage.get('../../etc/passwd'),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });

  it('rejects drive-relative keys via the containment check on Windows', async () => {
    // A drive-relative key (e.g. 'x:y') passes every character check but
    // resolves onto a different drive on Windows, so only the resolved-path
    // containment check can reject it. On POSIX it is an ordinary filename
    // inside the storage root.
    const key = 'x:y';
    if (process.platform === 'win32') {
      await expect(storage.put(key, Buffer.from('x'))).rejects.toBeInstanceOf(
        InvalidStorageKeyError,
      );
      await expect(storage.get(key)).rejects.toBeInstanceOf(InvalidStorageKeyError);
      return;
    }
    await expect(storage.put(key, Buffer.from('x'))).resolves.toBeUndefined();
    await expect(storage.get(key)).resolves.toEqual(Buffer.from('x'));
  });

  it('rejects absolute path keys', async () => {
    await expect(storage.put('/etc/passwd', Buffer.from('x'))).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
  });

  it('rejects keys containing backslashes', async () => {
    await expect(
      storage.put('partners\\escape.pdf', Buffer.from('x')),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });

  it('rejects keys containing NUL bytes', async () => {
    await expect(storage.put('partners/esc\0ape.pdf', Buffer.from('x'))).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
  });

  it('rejects empty keys', async () => {
    await expect(storage.put('', Buffer.from('x'))).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
    await expect(storage.get('')).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });

  it('creates and uses a nested storage root', async () => {
    const nestedRoot = join(root, 'nested');
    const nested = new LocalDiskStorage(nestedRoot);
    const key = 'partners/partner-1/doc.pdf';
    const contents = Buffer.from('nested-root-document');

    await nested.put(key, contents);

    await expect(nested.get(key)).resolves.toEqual(contents);
    await expect(access(join(nestedRoot, 'partners', 'partner-1', 'doc.pdf'))).resolves.toBeUndefined();
  });

  it('round-trips a server-generated key with a safe extension', async () => {
    const key = `partners/${'a'.repeat(36)}/${'b'.repeat(36)}.pdf`;
    const contents = Buffer.from('generated-key-document');

    await storage.put(key, contents);

    await expect(storage.get(key)).resolves.toEqual(contents);
  });
});
