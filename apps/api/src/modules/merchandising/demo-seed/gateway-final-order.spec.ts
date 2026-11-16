import { createHash } from 'crypto';
import { BlogStatus } from '@prisma/client';
import type { PrismaService } from '../../../common/database/prisma.service';
import { HomepageDraftService } from '../homepage/homepage-draft.service';
import { HomepageSourceService } from '../homepage/homepage-source.service';
import { LocalDiskMediaStorage } from '../../products/storage/local-disk-media.storage';
import { sanitizeRichText } from '../../products/description-sanitize';
import { expectedMediaOriginalName } from './ownership';
import { DEMO_SEED_ACTOR_ID } from './constants';
import {
  buildDemoSeedIntent,
  computeAssetsIntent,
} from './intent';
import { buildDemoSeedPlan } from './planner';
import {
  approvedManifest,
  options,
  planInput,
} from './test-fixtures';
import { createPrismaDemoSeedWriteGateway } from './write-gateway';

const MAIN = Buffer.alloc(100, 1);
const THUMB = Buffer.alloc(50, 2);
const MAIN_SHA = createHash('sha256').update(MAIN).digest('hex');
const THUMB_SHA = createHash('sha256').update(THUMB).digest('hex');

interface FakeBlogRow {
  id: string;
  slug: string;
  status: BlogStatus;
  createdBy: string | null;
  updatedBy: string | null;
  publishedAt: Date | null;
  title: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  authorName: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  categoryId: string | null;
}

function finalFixture() {
  const manifest = approvedManifest();
  const input = planInput(manifest, {
    options: options({ operationId: 'final-order-test' }),
  });
  const plan = buildDemoSeedPlan(input);
  const intent = buildDemoSeedIntent({
    operationId: input.options.operationId,
    identity: input.identity,
    manifest,
    assets: computeAssetsIntent(input),
    plan,
    input,
    options: input.options,
  });

  const campaignRows = manifest.campaigns.map((definition) => ({
    id: `campaign-${definition.key}`,
    internalName: definition.internalName,
    createdBy: DEMO_SEED_ACTOR_ID,
    updatedBy: null,
    archivedAt: null,
  }));
  const campaignIds = new Map(
    campaignRows.map((row) => [row.internalName, row.id]),
  );
  const mediaRows = manifest.media.map((definition) => ({
    id: `media-${definition.key}`,
    originalName: expectedMediaOriginalName(definition),
    storageKey: `merchandising/demo/test/${definition.key}.jpg`,
    thumbnailKey: `merchandising/demo/test/${definition.key}.thumb.webp`,
    sizeBytes: MAIN.byteLength,
    sourceSha256: 'a'.repeat(64),
    processedSha256: MAIN_SHA,
    thumbnailSha256: THUMB_SHA,
    createdBy: DEMO_SEED_ACTOR_ID,
    publishedAt: null as Date | null,
    deletedAt: null as Date | null,
  }));
  const mediaIds = new Map(
    mediaRows.map((row) => [row.originalName, row.id]),
  );
  const statuses = new Map<string, BlogStatus>();
  const blogRows: FakeBlogRow[] = manifest.blog.map((definition) => {
    const blogId = `blog-${definition.key}`;
    statuses.set(blogId, BlogStatus.DRAFT);
    return {
      id: blogId,
      slug: definition.slug,
      status: BlogStatus.DRAFT,
      createdBy: DEMO_SEED_ACTOR_ID,
      updatedBy: null as string | null,
      publishedAt: null as Date | null,
      title: definition.title,
      excerpt: definition.excerpt,
      content: sanitizeRichText(definition.content),
      coverImageUrl: definition.coverAssetKey
        ? `${input.options.publicApiBaseUrl}/catalog/merch-media/media-${definition.coverAssetKey}`
        : null,
      authorName: definition.authorName,
      metaTitle: null,
      metaDescription: null,
      categoryId: null,
    };
  });
  const blogIds = new Map(
    blogRows.map((row) => [row.slug, row.id]),
  );

  const journal = {
    state: 'BLOG_DRAFTS_READY',
    intentHash: intent.intentHash,
    steps: {} as Record<string, unknown>,
  };
  let publication: {
    id: string;
    version: number;
    status: string;
    demoSeedOperationId: string;
  } | null = null;
  let draftRevision = 3;
  const audits: Array<Record<string, unknown>> = [];

  const snapshot = () => ({
    statuses: new Map(statuses),
    blogRows: blogRows.map((row) => ({
      status: row.status,
      publishedAt: row.publishedAt,
      updatedBy: row.updatedBy,
    })),
    journal: { ...journal, steps: { ...journal.steps } },
    publication: publication === null ? null : { ...publication },
    draftRevision,
    auditCount: audits.length,
  });
  const restore = (saved: ReturnType<typeof snapshot>) => {
    for (const [id, status] of saved.statuses) statuses.set(id, status);
    blogRows.forEach((row, index) => {
      const savedRow = saved.blogRows[index]!;
      row.status = savedRow.status;
      row.publishedAt = savedRow.publishedAt;
      row.updatedBy = savedRow.updatedBy;
    });
    journal.state = saved.journal.state;
    journal.steps = saved.journal.steps;
    publication = saved.publication;
    draftRevision = saved.draftRevision;
    audits.length = saved.auditCount;
  };

  const tx: Record<string, unknown> = {};
  const client = {
    ...tx,
    $transaction: jest.fn(
      async (fn: (transaction: Record<string, unknown>) => Promise<unknown>) => {
        const saved = snapshot();
        try {
          return await fn(tx);
        } catch (error) {
          restore(saved);
          throw error;
        }
      },
    ),
    merchCampaign: {
      findMany: jest.fn(
        async ({ where }: { where?: { internalName?: string } } = {}) =>
          where?.internalName === undefined
            ? campaignRows
            : [
                {
                  id:
                    campaignIds.get(where.internalName) ??
                    `missing-${where.internalName}`,
                },
              ],
      ),
    },
    merchMedia: {
      findMany: jest.fn(
        async ({ where }: { where?: { originalName?: string } } = {}) =>
          where?.originalName === undefined
            ? mediaRows
            : [
                {
                  id:
                    mediaIds.get(where.originalName) ??
                    `missing-${where.originalName}`,
                },
              ],
      ),
    },
    blogPost: {
      findMany: jest.fn(
        async ({ where }: { where?: { slug?: string } } = {}) =>
          where?.slug === undefined
            ? blogRows
            : [{ id: blogIds.get(where.slug) ?? `missing-${where.slug}` }],
      ),
    },
  };
  tx.$executeRawUnsafe = jest.fn(async () => 1);
  tx.$queryRaw = jest.fn(
    async (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('pg_control_system')) {
        return [
          {
            systemIdentifier: input.identity.systemIdentifier,
            databaseName: input.identity.databaseName,
            databaseOid: String(input.identity.databaseOid),
            postgresVersion: input.identity.postgresVersion,
          },
        ];
      }
      if (sql.includes('FROM "HomepagePublication"')) {
        return publication === null ? [] : [{ ...publication }];
      }
      if (sql.includes('"steps"')) {
        return [
          {
            state: journal.state,
            intentHash: journal.intentHash,
            steps: journal.steps,
          },
        ];
      }
      if (sql.includes('FROM "HomepageDemoSeedOperation"')) {
        return [{ state: journal.state, intentHash: journal.intentHash }];
      }
      if (sql.includes('FROM "BlogPost"')) {
        return blogRows.map((row) => ({ id: row.id }));
      }
      return [];
    },
  );
  tx.merchCampaign = {
    findMany: jest.fn(async () => campaignRows),
  };
  tx.merchMedia = {
    findMany: jest.fn(
      async ({ where }: { where?: { id?: unknown; publishedAt?: unknown } } = {}) =>
        where?.publishedAt !== undefined ? [] : mediaRows,
    ),
    updateMany: jest.fn(async () => ({ count: mediaRows.length })),
  };
  tx.blogPost = {
    findMany: jest.fn(
      async ({ where }: { where?: { id?: unknown } } = {}) =>
        where?.id === undefined ? [] : blogRows,
    ),
    update: jest.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = blogRows.find((item) => item.id === where.id);
        if (!row) throw new Error('blog row missing');
        if (data.status !== undefined) row.status = data.status as BlogStatus;
        if (data.publishedAt !== undefined) {
          row.publishedAt = data.publishedAt as Date;
        }
        if (data.updatedBy !== undefined) {
          row.updatedBy = data.updatedBy as string;
        }
        return { ...row };
      },
    ),
  };
  tx.homepageDraft = {
    update: jest.fn(
      async ({ data }: { data: { revision: { increment: number } } }) => {
        draftRevision += data.revision.increment;
        return { revision: draftRevision };
      },
    ),
  };
  tx.homepagePublication = {
    findMany: jest.fn(async () => [{ version: 3 }]),
    updateMany: jest.fn(async () => ({ count: 1 })),
    aggregate: jest.fn(async () => ({ _max: { version: 3 } })),
    create: jest.fn(
      async ({
        data,
      }: {
        data: { version: number; demoSeedOperationId: string };
      }) => {
        publication = {
          id: 'publication-id',
          version: data.version,
          status: 'PUBLISHED',
          demoSeedOperationId: data.demoSeedOperationId,
        };
        return { ...publication };
      },
    ),
  };
  tx.homepageDemoSeedOperation = {
    updateMany: jest.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (where.state !== journal.state) return { count: 0 };
        journal.state = String(data.state);
        journal.steps = (data.steps as Record<string, unknown>) ?? journal.steps;
        return { count: 1 };
      },
    ),
  };
  tx.auditLog = {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      audits.push(data);
      return { id: `audit-${audits.length}` };
    }),
  };

  const prisma = client as unknown as PrismaService;
  const gateway = createPrismaDemoSeedWriteGateway({
    prisma,
    fence: {
      ownerToken: 'owner',
      generation: 1,
      operationId: input.options.operationId,
      lockWithinTransaction: async () => undefined,
    },
    plan,
    planInput: input,
    intent,
    backup: {
      path: '/tmp/final-order-backup.json',
      checksum: 'a'.repeat(64),
      sizeBytes: 1,
    },
  });

  return {
    gateway,
    manifest,
    input,
    intent,
    plan,
    campaignRows,
    mediaRows,
    blogRows,
    statuses,
    journal,
    getPublication: () => publication,
    getDraftRevision: () => draftRevision,
    tx,
    rawTx: tx,
    audits,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('homepage demo seed real gateway final ordering', () => {
  it('activates approved blogs before snapshot construction and commits the publication', async () => {
    const fixture = finalFixture();
    const snapshotStatuses: BlogStatus[][] = [];
    jest
      .spyOn(HomepageDraftService.prototype, 'lockCurrentDraft')
      .mockResolvedValue({
        revision: fixture.plan.draft.sourceRevision ?? 0,
        schemaVersion: 1,
        sections: [],
      } as never);
    jest
      .spyOn(LocalDiskMediaStorage.prototype, 'get')
      .mockImplementation(async (key: string) =>
        key.endsWith('.thumb.webp') ? THUMB : MAIN,
      );
    jest
      .spyOn(HomepageSourceService.prototype, 'buildSnapshot')
      .mockImplementation(async () => {
        snapshotStatuses.push(
          fixture.blogRows.map((row) => row.status),
        );
        return {
          snapshot: {
            schemaVersion: 1,
            sections: [
              {
                key: 'all-media',
                type: 'HERO_CAROUSEL',
                order: 0,
                isVisible: true,
                settings: { campaigns: [] },
                media: fixture.mediaRows.map((row) => ({
                  mediaId: row.id,
                })),
              },
            ],
          },
          errors: [],
          warnings: [],
        } as never;
      });

    const result = await fixture.gateway.applyDraftAndPublication();

    expect(snapshotStatuses).toHaveLength(1);
    expect(
      snapshotStatuses[0]!.every((status) => status === BlogStatus.PUBLISHED),
    ).toBe(true);
    expect(result.revision).toBe(4);
    expect(result.publicationId).toBe('publication-id');
    expect(fixture.getPublication()).toEqual(
      expect.objectContaining({
        id: 'publication-id',
        status: 'PUBLISHED',
        demoSeedOperationId: fixture.intent.operationId,
      }),
    );
    expect(fixture.journal.state).toBe('COMPLETED');
    expect(fixture.getDraftRevision()).toBe(4);
    expect(
      fixture.blogRows.every((row) => row.status === BlogStatus.PUBLISHED),
    ).toBe(true);
    expect(fixture.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'HOMEPAGE_DEMO_BLOGS_ACTIVATED' }),
      ]),
    );
  });

  it('rolls back blog activation when publication creation fails', async () => {
    const fixture = finalFixture();
    jest
      .spyOn(HomepageDraftService.prototype, 'lockCurrentDraft')
      .mockResolvedValue({
        revision: fixture.plan.draft.sourceRevision ?? 0,
        schemaVersion: 1,
        sections: [],
      } as never);
    jest
      .spyOn(LocalDiskMediaStorage.prototype, 'get')
      .mockImplementation(async (key: string) =>
        key.endsWith('.thumb.webp') ? THUMB : MAIN,
      );
    jest
      .spyOn(HomepageSourceService.prototype, 'buildSnapshot')
      .mockResolvedValue({
        snapshot: {
          schemaVersion: 1,
          sections: [
            {
              key: 'all-media',
              type: 'HERO_CAROUSEL',
              order: 0,
              isVisible: true,
              settings: { campaigns: [] },
              media: fixture.mediaRows.map((row) => ({ mediaId: row.id })),
            },
          ],
        },
        errors: [],
        warnings: [],
      } as never);
    const create = (
      fixture.tx as unknown as {
        homepagePublication: { create: jest.Mock };
      }
    ).homepagePublication;
    create.create.mockRejectedValueOnce(new Error('publication write failed'));

    await expect(
      fixture.gateway.applyDraftAndPublication(),
    ).rejects.toThrow('publication write failed');

    expect(
      fixture.blogRows.every((row) => row.status === BlogStatus.DRAFT),
    ).toBe(true);
    expect(fixture.getDraftRevision()).toBe(3);
    expect(fixture.getPublication()).toBeNull();
    expect(fixture.journal.state).toBe('BLOG_DRAFTS_READY');
    expect(fixture.audits).toHaveLength(0);
  });
});
