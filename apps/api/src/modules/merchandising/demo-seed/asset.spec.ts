import { mkdtemp, mkdir, readFile, rm, symlink, truncate, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { copyVerifiedAsset, inspectAsset } from './asset';
import { DEMO_MAX_ASSET_BYTES } from './constants';

describe('homepage demo seed asset hardening', () => {
  const dirs: string[] = [];

  async function tempRoot(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'homepage-demo-assets-'));
    dirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('accepts a valid in-root regular file and copies exactly the inspected bytes', async () => {
    const root = await tempRoot();
    const source = join(root, 'hero.jpg');
    const contents = Buffer.from('valid-image-content');
    await writeFile(source, contents);
    const inspected = await inspectAsset(root, 'hero.jpg');
    expect(inspected.exists).toBe(true);
    expect(inspected.sizeBytes).toBe(contents.byteLength);
    expect(inspected.sha256).toHaveLength(64);

    const destination = join(root, 'copy.jpg');
    await copyVerifiedAsset(inspected, destination);
    expect(await readFile(destination)).toEqual(contents);
  });

  it('rejects traversal and absolute filenames', async () => {
    const root = await tempRoot();
    expect((await inspectAsset(root, '../secret.jpg')).error).toMatch(/relative/);
    expect((await inspectAsset(root, '/etc/passwd')).error).toMatch(/relative/);
  });

  it('rejects symlinked files and symlinked parents', async () => {
    const root = await tempRoot();
    const outside = await tempRoot();
    const outsideFile = join(outside, 'secret.jpg');
    await writeFile(outsideFile, Buffer.from('secret'));
    await symlink(outsideFile, join(root, 'link.jpg'));
    expect((await inspectAsset(root, 'link.jpg')).error).toMatch(/Symbolic links/);

    const parent = join(root, 'linked-parent');
    await symlink(outside, parent);
    await writeFile(join(outside, 'inside-link.jpg'), Buffer.from('secret'));
    expect((await inspectAsset(root, 'linked-parent/inside-link.jpg')).error).toMatch(
      /Symlinked asset parents/,
    );
  });

  it('rejects non-regular files and oversized files', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'directory'));
    expect((await inspectAsset(root, 'directory')).error).toMatch(/regular files/);

    const huge = join(root, 'huge.jpg');
    await writeFile(huge, Buffer.from('x'));
    await truncate(huge, DEMO_MAX_ASSET_BYTES + 1);
    expect((await inspectAsset(root, 'huge.jpg')).error).toMatch(/exceeds/);
  });

  it('aborts copy when the file changed after inspection', async () => {
    const root = await tempRoot();
    const source = join(root, 'hero.jpg');
    await writeFile(source, Buffer.from('first-content'));
    const inspected = await inspectAsset(root, 'hero.jpg');
    await writeFile(source, Buffer.from('second-content'));
    await expect(
      copyVerifiedAsset(inspected, join(root, 'copy.jpg')),
    ).rejects.toThrow(/changed/);
  });
});
