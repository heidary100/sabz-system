import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'fs/promises';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import {
  BackupExistsError,
  backupFs,
  checksumPayload,
  createDraftBackup,
  readAndVerifyBackup,
} from './backup';
import { HISTORICAL_IDENTITY } from './test-fixtures';

const NOW = new Date('2026-11-15T10:00:00.000Z');

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'homepage-demo-backup-'));
}

const draft = {
  revision: 3,
  schemaVersion: 1,
  sections: [],
  updatedAt: '2026-11-10T20:50:15.442Z',
};

describe('homepage demo seed draft backup', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function createDir(): Promise<string> {
    const dir = await tempDir();
    dirs.push(dir);
    return dir;
  }

  it('writes an exclusive, checksummed, permission-restricted backup', async () => {
    const backupDir = await createDir();
    const result = await createDraftBackup({
      backupDir,
      identity: HISTORICAL_IDENTITY,
      draft,
      operationId: 'op-1',
      now: NOW,
    });
    expect(result.path).toContain('homepage-draft-rev-3-');
    expect(result.checksum).toHaveLength(64);
    const file = await stat(result.path);
    const directory = await stat(backupDir);
    expect(file.mode & 0o777).toBe(0o600);
    expect(directory.mode & 0o777).toBe(0o700);
    const verified = await readAndVerifyBackup(result.path, { backupDir });
    expect(verified.checksum).toBe(result.checksum);
    expect(verified.payload.draft).toEqual(draft);
    expect(verified.payload.identity).toEqual(HISTORICAL_IDENTITY);
  });

  it('never overwrites an existing backup', async () => {
    const backupDir = await createDir();
    await createDraftBackup({
      backupDir,
      identity: HISTORICAL_IDENTITY,
      draft,
      operationId: 'same-op',
      now: NOW,
    });
    await expect(
      createDraftBackup({
        backupDir,
        identity: HISTORICAL_IDENTITY,
        draft,
        operationId: 'same-op',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(BackupExistsError);
  });

  it('detects read-back tampering', async () => {
    const backupDir = await createDir();
    const result = await createDraftBackup({
      backupDir,
      identity: HISTORICAL_IDENTITY,
      draft,
      operationId: 'tamper',
      now: NOW,
    });
    const text = await readFile(result.path, 'utf8');
    const tampered = text.replace('"revision": 3', '"revision": 4');
    expect(tampered).not.toBe(text);
    await writeFile(result.path, tampered, 'utf8');
    await expect(readAndVerifyBackup(result.path, { backupDir })).rejects.toThrow(
      /checksum verification failed/,
    );
  });

  it('aborts when the file write fails', async () => {
    const backupDir = await createDir();
    const failingFs = {
      ...backupFs,
      open: async () => ({
        writeFile: async () => {
          const error = new Error('No space left on device');
          (error as NodeJS.ErrnoException).code = 'ENOSPC';
          throw error;
        },
        sync: async () => undefined,
        close: async () => undefined,
      }),
    };
    await expect(
      createDraftBackup({
        backupDir,
        identity: HISTORICAL_IDENTITY,
        draft,
        operationId: 'disk-full',
        now: NOW,
        fs: failingFs,
      }),
    ).rejects.toThrow(/No space left/);
  });

  it('aborts without a final backup when hard-link publication is unavailable', async () => {
    const backupDir = await createDir();
    const noHardLinks = {
      ...backupFs,
      link: async () => {
        const error = new Error('hard links are not supported by this filesystem');
        (error as NodeJS.ErrnoException).code = 'EOPNOTSUPP';
        throw error;
      },
    };
    await expect(
      createDraftBackup({
        backupDir,
        identity: HISTORICAL_IDENTITY,
        draft,
        operationId: 'no-hard-links',
        now: NOW,
        fs: noHardLinks,
      }),
    ).rejects.toMatchObject({ code: 'EOPNOTSUPP' });
    expect(await readdir(backupDir)).toEqual([]);
  });

  it('rejects an ownership mismatch before writing the backup', async () => {
    const backupDir = await createDir();
    await expect(
      createDraftBackup({
        backupDir,
        identity: HISTORICAL_IDENTITY,
        draft,
        operationId: 'owner-mismatch',
        now: NOW,
        expectedUid: 999_999,
      }),
    ).rejects.toThrow(/ownership/);
  });

  it('rejects unsupported formats and malformed identity/payload data', async () => {
    const backupDir = await createDir();
    const basePayload = {
      formatVersion: 1,
      operationId: 'op-invalid',
      createdAt: NOW.toISOString(),
      identity: HISTORICAL_IDENTITY,
      draft,
    };
    const writeEnvelope = async (
      name: string,
      payload: unknown,
      overrides: Record<string, unknown> = {},
      mode = 0o600,
    ) => {
      const checksum = checksumPayload(payload);
      const path = join(backupDir, name);
      await writeFile(
        path,
        JSON.stringify({
          formatVersion: 1,
          checksumAlgorithm: 'sha256',
          checksum,
          payload,
          ...overrides,
        }),
        { mode },
      );
      return path;
    };

    await expect(
      readAndVerifyBackup(
        await writeEnvelope('unsupported.json', basePayload, {
          formatVersion: 2,
        }),
        { backupDir },
      ),
    ).rejects.toThrow(/invalid or unsupported/);

    await expect(
      readAndVerifyBackup(
        await writeEnvelope('bad-checksum.json', basePayload, {
          checksum: 'not-a-sha256',
        }),
        { backupDir },
      ),
    ).rejects.toThrow(/invalid or unsupported/);

    await expect(
      readAndVerifyBackup(
        await writeEnvelope('missing-identity.json', {
          ...basePayload,
          identity: undefined,
        }),
        { backupDir },
      ),
    ).rejects.toThrow(/invalid or unsupported/);

    await expect(
      readAndVerifyBackup(
        await writeEnvelope('bad-fingerprint.json', {
          ...basePayload,
          identity: { ...HISTORICAL_IDENTITY, fingerprint: '0'.repeat(64) },
        }),
        { backupDir },
      ),
    ).rejects.toThrow(/invalid or unsupported/);

    await expect(
      readAndVerifyBackup(
        await writeEnvelope('bad-revision.json', {
          ...basePayload,
          draft: { ...draft, revision: -1 },
        }),
        { backupDir },
      ),
    ).rejects.toThrow(/invalid or unsupported/);

    await expect(
      readAndVerifyBackup(
        await writeEnvelope('bad-sections.json', {
          ...basePayload,
          draft: { ...draft, sections: {} },
        }),
        { backupDir },
      ),
    ).rejects.toThrow(/invalid or unsupported/);

    await expect(
      readAndVerifyBackup(
        await writeEnvelope('bad-schema-version.json', {
          ...basePayload,
          draft: { ...draft, schemaVersion: 2 },
        }),
        { backupDir },
      ),
    ).rejects.toThrow(/invalid or unsupported/);

    await expect(
      readAndVerifyBackup(
        await writeEnvelope('unknown-section.json', {
          ...basePayload,
          draft: {
            ...draft,
            sections: [
              {
                key: 'unknown',
                type: 'NOT_A_SECTION',
                order: 0,
                isVisible: true,
                settings: {},
              },
            ],
          },
        }),
        { backupDir },
      ),
    ).rejects.toThrow(/invalid or unsupported/);

    await expect(
      readAndVerifyBackup(
        await writeEnvelope('bad-settings.json', {
          ...basePayload,
          draft: {
            ...draft,
            sections: [
              {
                key: 'trust',
                type: 'TRUST_STRIP',
                order: 0,
                isVisible: true,
                settings: { items: 'not-an-array' },
              },
            ],
          },
        }),
        { backupDir },
      ),
    ).rejects.toThrow(/invalid or unsupported/);

    const permissive = await writeEnvelope(
      'permissive.json',
      basePayload,
      {},
      0o644,
    );
    await chmod(permissive, 0o644);
    await expect(readAndVerifyBackup(permissive, { backupDir })).rejects.toThrow(
      /permissions/,
    );
  });

  it('rejects operation ids that could escape the backup filename', async () => {
    const backupDir = await createDir();
    for (const operationId of [
      '../escape',
      'a/b',
      'a\\b',
      '..',
      'a b',
      'a.b',
      'a\0b',
      '-leading',
      'x'.repeat(81),
    ]) {
      await expect(
        createDraftBackup({
          backupDir,
          identity: HISTORICAL_IDENTITY,
          draft,
          operationId,
          now: NOW,
        }),
      ).rejects.toThrow(/HOMEPAGE_DEMO_OPERATION_ID/);
    }
    expect(await readdir(backupDir)).toEqual([]);
  });

  it('rejects a symlinked backup file', async () => {
    const backupDir = await createDir();
    const result = await createDraftBackup({
      backupDir,
      identity: HISTORICAL_IDENTITY,
      draft,
      operationId: 'symlink-file',
      now: NOW,
    });
    const link = join(backupDir, 'linked.json');
    await symlink(result.path, link);
    await expect(
      readAndVerifyBackup(link, { backupDir }),
    ).rejects.toThrow(/symlink/);
  });

  it('rejects a symlinked backup root', async () => {
    const base = await createDir();
    const real = join(base, 'real');
    const link = join(base, 'link');
    await mkdir(real, { mode: 0o700 });
    await symlink(real, link);
    await expect(
      createDraftBackup({
        backupDir: link,
        identity: HISTORICAL_IDENTITY,
        draft,
        operationId: 'symlink-root',
        now: NOW,
      }),
    ).rejects.toThrow(/symbolic link|symlink/);
  });

  it('rejects a path that traverses a symlinked parent during verification', async () => {
    const root = await createDir();
    const other = await createDir();
    const result = await createDraftBackup({
      backupDir: other,
      identity: HISTORICAL_IDENTITY,
      draft,
      operationId: 'symlink-parent',
      now: NOW,
    });
    const linked = join(root, 'linked');
    await symlink(other, linked);
    await expect(
      readAndVerifyBackup(join(linked, basename(result.path)), {
        backupDir: root,
      }),
    ).rejects.toThrow(/symlink/);
  });

  it('rejects backup paths outside the configured root', async () => {
    const root = await createDir();
    const other = await createDir();
    const result = await createDraftBackup({
      backupDir: other,
      identity: HISTORICAL_IDENTITY,
      draft,
      operationId: 'outside-root',
      now: NOW,
    });
    await expect(
      readAndVerifyBackup(result.path, { backupDir: root }),
    ).rejects.toThrow(/outside the configured backup root/);
  });

  it('rejects non-regular backup destinations', async () => {
    const backupDir = await createDir();
    const directory = join(backupDir, 'directory.json');
    await mkdir(directory, { mode: 0o700 });
    await expect(
      readAndVerifyBackup(directory, { backupDir }),
    ).rejects.toThrow(/regular file/);
  });

  it('checksum is stable across key order', () => {
    expect(checksumPayload({ b: 1, a: 2 })).toBe(
      checksumPayload({ a: 2, b: 1 }),
    );
  });
});
