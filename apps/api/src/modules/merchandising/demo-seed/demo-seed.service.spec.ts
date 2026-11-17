import { DemoSeedService } from './demo-seed.service';
import { DemoSeedBlockedError } from './planner';
import { DEMO_SEED_MANIFEST } from './manifest';
import { MediaStorageConflictError } from '../media/idempotent-media-storage';
import type { DemoSeedGuardrails } from './guardrails';
import {
  approvedManifest,
  fakeWriter,
  manifestWithPending,
  options,
  planInput,
} from './test-fixtures';
import type { DemoSeedPlanLoader } from './plan-loader';

function loaderFor(input: ReturnType<typeof planInput>): DemoSeedPlanLoader {
  return {
    load: async () => input,
  };
}

function fakeGuardrails(completed: unknown = null): DemoSeedGuardrails {
  const completion =
    completed === null
      ? null
      : {
          publicationId: 'publication-1',
          publicationVersion: 7,
          draftRevision: 5,
          result: completed,
        };
  return {
    acquireLock: async () => ({
      ownerToken: 'test-owner',
      generation: 1,
      operationId: 'test-operation',
      lockWithinTransaction: async () => undefined,
      assertHeld: async () => undefined,
      release: async () => undefined,
    }),
    readCompletion: async () => completion,
    openJournal: async () => ({
      completed: null,
      planHash: 'plan-hash',
      intentHash: 'intent-hash',
      baselineHash: 'baseline-hash',
      recordMediaReconciliation: async () => undefined,
      recordBackup: async () => undefined,
      advance: async () => undefined,
      fail: async () => undefined,
    }),
  };
}

describe('DemoSeedService', () => {
  it('plans without constructing a write gateway', async () => {
    const input = planInput();
    const factory = jest.fn(() => fakeWriter([]));
    const service = new DemoSeedService(
      loaderFor(input),
      factory,
      fakeGuardrails(),
    );
    const result = await service.plan(options(), approvedManifest());
    expect(result.plan.sections).toHaveLength(9);
    expect(factory).not.toHaveBeenCalled();
  });

  it('refuses apply while approvals are pending and never creates journal state or the writer', async () => {
    const input = planInput(manifestWithPending(['trust_claims']));
    const factory = jest.fn(() => fakeWriter([]));
    const openJournal = jest.fn(async () => {
      throw new Error('journal must not be opened for a blocked plan');
    });
    const guardrails = fakeGuardrails();
    guardrails.openJournal = openJournal;
    const service = new DemoSeedService(
      loaderFor(input),
      factory,
      guardrails,
    );
    await expect(
      service.apply(options(), manifestWithPending(['trust_claims'])),
    ).rejects.toBeInstanceOf(DemoSeedBlockedError);
    expect(factory).not.toHaveBeenCalled();
    expect(openJournal).not.toHaveBeenCalled();
  });

  it('backs up before the first write and applies in media -> campaign -> blog -> draft order', async () => {
    const calls: string[] = [];
    const input = planInput();
    const service = new DemoSeedService(
      loaderFor(input),
      () => fakeWriter(calls),
      fakeGuardrails(),
      async () => {
        calls.push('backup');
        return {
          path: '/tmp/backup.json',
          checksum: 'a'.repeat(64),
          sizeBytes: 10,
        };
      },
      () => new Date('2026-11-15T00:00:00.000Z'),
    );

    const result = await service.apply(options(), approvedManifest());
    expect(calls[0]).toBe('backup');
    expect(calls.filter((call) => call.startsWith('media:'))).toHaveLength(
      input.manifest.media.length,
    );
    expect(calls.filter((call) => call.startsWith('campaign:'))).toHaveLength(
      input.manifest.campaigns.length,
    );
    const spotlight = input.manifest.campaigns[2];
    if (!spotlight) throw new Error('fixture is missing a spotlight campaign');
    expect(calls).toContain(`campaign:${spotlight.key}`);
    expect(calls.filter((call) => call.startsWith('blog:'))).toHaveLength(
      input.manifest.blog.length,
    );
    expect(calls.at(-1)).toBe('draft');
    expect(result.backup?.path).toBe('/tmp/backup.json');
    expect(result.draft.revision).toBe(4);
    expect(result.replayed).toBe(false);
  });

  it('blocks draft-only because the snapshot contract requires published blog posts', async () => {
    const calls: string[] = [];
    const manifest = approvedManifest();
    for (const article of manifest.blog) {
      article.publish = false;
    }
    const draftOnly = options({
      publish: false,
      publishConfirm: false,
      acknowledgePublicationReplacement: false,
    });
    const input = planInput(manifest, { options: draftOnly });
    const factory = jest.fn(() => fakeWriter(calls));
    const service = new DemoSeedService(
      loaderFor(input),
      factory,
      fakeGuardrails(),
      async () => ({
        path: '/tmp/backup.json',
        checksum: 'b'.repeat(64),
        sizeBytes: 10,
      }),
    );
    await expect(service.apply(draftOnly, manifest)).rejects.toBeInstanceOf(
      DemoSeedBlockedError,
    );
    expect(factory).not.toHaveBeenCalled();
  });

  it('does not construct the writer when backup creation fails', async () => {
    const calls: string[] = [];
    const input = planInput();
    const service = new DemoSeedService(
      loaderFor(input),
      () => fakeWriter(calls),
      fakeGuardrails(),
      async () => {
        throw new Error('backup failed');
      },
    );
    await expect(service.apply(options(), approvedManifest())).rejects.toThrow(
      /backup failed/,
    );
    expect(calls).toEqual([]);
  });

  it('returns the stored result for a completed operation without constructing the writer', async () => {
    const stored = {
      campaigns: { hero: 'campaign-1' },
      media: { hero: 'media-1' },
      blog: { article: 'blog-1' },
      backup: null,
      draft: {
        revision: 4,
        publicationId: null,
        publicationVersion: null,
        supersededVersions: [],
      },
    };
    const factory = jest.fn(() => fakeWriter([]));
    const service = new DemoSeedService(
      loaderFor(planInput()),
      factory,
      fakeGuardrails(stored),
    );
    const result = await service.apply(options(), approvedManifest());
    expect(result.replayed).toBe(true);
    expect(result.campaigns).toEqual(stored.campaigns);
    expect(result.media).toEqual(stored.media);
    expect(result.blog).toEqual(stored.blog);
    expect(factory).not.toHaveBeenCalled();
  });

  it('leaves a media conflict in a manual-recovery state instead of FAILED', async () => {
    const fail = jest.fn(async () => undefined);
    const guardrails = fakeGuardrails();
    const openJournal = guardrails.openJournal.bind(guardrails);
    guardrails.openJournal = async (input) => ({
      ...(await openJournal(input)),
      fail,
    });
    const service = new DemoSeedService(
      loaderFor(planInput()),
      () => ({
        ...fakeWriter([]),
        async uploadOrReuseMedia() {
          throw new MediaStorageConflictError(
            'merchandising/demo/operation/asset.jpg',
          );
        },
      }),
      guardrails,
    );
    await expect(
      service.apply(options(), approvedManifest()),
    ).rejects.toBeInstanceOf(MediaStorageConflictError);
    expect(fail).not.toHaveBeenCalled();
  });

  it('respects the manifest passed to apply rather than the default manifest', async () => {
    const input = planInput(DEMO_SEED_MANIFEST, { assets: {} });
    const factory = jest.fn(() => fakeWriter([]));
    const service = new DemoSeedService(
      loaderFor(input),
      factory,
      fakeGuardrails(),
    );
    await expect(
      service.apply(options(), DEMO_SEED_MANIFEST),
    ).rejects.toBeInstanceOf(DemoSeedBlockedError);
    expect(factory).not.toHaveBeenCalled();
  });
});
