import { BlogStatus, Prisma } from '@prisma/client';
import type { HomepageDraftSection } from '@sabz/types';
import { HomepageSourceService } from '../homepage/homepage-source.service';
import { sanitizeRichText } from '../../products/description-sanitize';
import {
  activateFinalBlogRows,
  lockAndValidateFinalBlogRows,
} from './blog-finalization';
import { DEMO_SEED_ACTOR_ID } from './constants';
import { approvedManifest } from './test-fixtures';

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

const POST_ID = '9a2f7c3e-1b4d-4e6f-8a0c-2d5f7b9e1a3c';

function fixture() {
  const manifest = approvedManifest();
  const definition = manifest.blog[0]!;
  definition.coverAssetKey = null;
  manifest.blog = [definition];
  const row: FakeBlogRow = {
    id: POST_ID,
    slug: definition.slug,
    status: BlogStatus.DRAFT,
    createdBy: DEMO_SEED_ACTOR_ID,
    updatedBy: null,
    publishedAt: null,
    title: definition.title,
    excerpt: definition.excerpt,
    content: sanitizeRichText(definition.content),
    coverImageUrl: null,
    authorName: definition.authorName,
    metaTitle: null,
    metaDescription: null,
    categoryId: null,
  };
  const tx = {
    $queryRaw: jest.fn(async () => [{ id: row.id }]),
    blogPost: {
      findMany: jest.fn(
        async ({ select }: { select?: Record<string, boolean> } = {}) =>
          select?.title === true
            ? [{ ...row }]
            : [{ id: row.id, status: row.status }],
      ),
      update: jest.fn(
        async ({
          data,
        }: {
          data: { status: BlogStatus; publishedAt?: Date; updatedBy?: string };
        }) => {
          row.status = data.status;
          row.publishedAt = data.publishedAt ?? row.publishedAt;
          row.updatedBy = data.updatedBy ?? row.updatedBy;
          return { ...row };
        },
      ),
    },
  };
  return {
    manifest,
    definition,
    row,
    tx: tx as unknown as Prisma.TransactionClient,
    rawTx: tx,
  };
}

function section(): HomepageDraftSection {
  return {
    key: 'blog',
    type: 'BLOG_FEATURE',
    order: 0,
    isVisible: true,
    settings: { source: 'manual', postIds: [POST_ID] },
  } as unknown as HomepageDraftSection;
}

describe('homepage demo seed blog activation before snapshot', () => {
  it('rejects a referenced draft article before activation', async () => {
    const { tx } = fixture();
    const source = new HomepageSourceService();

    const built = await source.buildSnapshot(tx, [section()], {
      now: new Date('2026-11-16T00:00:00.000Z'),
      windowPolicy: 'allow-future-start',
    });

    expect(built.snapshot).toBeNull();
    expect(built.errors.map((error) => error.code)).toContain(
      'BLOG_POST_NOT_PUBLISHED',
    );
  });

  it('builds a valid snapshot after the same transaction activates the article', async () => {
    const { manifest, definition, row, tx, rawTx } = fixture();
    const source = new HomepageSourceService();
    const blogIds = { [definition.key]: row.id };

    const rows = await lockAndValidateFinalBlogRows(tx, {
      manifest,
      blogIds,
      mediaIds: {},
      publicApiBaseUrl: null,
    });
    const activated = await activateFinalBlogRows(
      tx,
      { manifest, blogIds },
      rows,
      new Date('2026-11-16T00:00:00.000Z'),
    );

    expect(activated).toEqual([row.id]);
    expect(row.status).toBe(BlogStatus.PUBLISHED);
    expect(rawTx.blogPost.update).toHaveBeenCalledTimes(1);

    const built = await source.buildSnapshot(tx, [section()], {
      now: new Date('2026-11-16T00:00:00.000Z'),
      windowPolicy: 'allow-future-start',
    });

    expect(built.errors).toEqual([]);
    expect(built.snapshot?.sections[0]).toEqual(
      expect.objectContaining({
        type: 'BLOG_FEATURE',
        settings: { source: 'manual', postIds: [row.id] },
      }),
    );
  });

  it('does not activate an article marked publish=false', async () => {
    const { manifest, definition, row, tx, rawTx } = fixture();
    manifest.blog[0]!.publish = false;
    const source = new HomepageSourceService();
    const blogIds = { [definition.key]: row.id };

    const rows = await lockAndValidateFinalBlogRows(tx, {
      manifest,
      blogIds,
      mediaIds: {},
      publicApiBaseUrl: null,
    });
    const activated = await activateFinalBlogRows(
      tx,
      { manifest, blogIds },
      rows,
      new Date('2026-11-16T00:00:00.000Z'),
    );
    const built = await source.buildSnapshot(tx, [section()], {
      now: new Date('2026-11-16T00:00:00.000Z'),
      windowPolicy: 'allow-future-start',
    });

    expect(activated).toEqual([]);
    expect(row.status).toBe(BlogStatus.DRAFT);
    expect(rawTx.blogPost.update).not.toHaveBeenCalled();
    expect(built.errors.map((error) => error.code)).toContain(
      'BLOG_POST_NOT_PUBLISHED',
    );
  });

  it('rejects a blog row that changed after planning', async () => {
    const { manifest, definition, row, tx } = fixture();
    row.title = 'changed after planning';

    await expect(
      lockAndValidateFinalBlogRows(tx, {
        manifest,
        blogIds: { [definition.key]: row.id },
        mediaIds: {},
        publicApiBaseUrl: null,
      }),
    ).rejects.toThrow(/changed after planning/);
  });
});
