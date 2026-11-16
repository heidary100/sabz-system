import { BlogStatus } from '@prisma/client';
import type { PrismaService } from '../../../common/database/prisma.service';
import { BlogService } from '../../blog/blog.service';
import { CampaignService } from '../campaigns/campaign.service';
import { DEMO_SEED_ACTOR_ID } from './constants';
import type { DemoSeedFence } from './demo-fence';
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
import type {
  DemoBlogArticleDefinition,
  DemoCampaignDefinition,
  DemoMediaAssetDefinition,
  DemoSeedManifest,
} from './types';
import { expectedMediaOriginalName } from './ownership';
import { createPrismaDemoSeedWriteGateway } from './write-gateway';

interface FakeCampaignRow {
  id: string;
  internalName: string;
  createdBy: string | null;
  updatedBy: string | null;
  archivedAt: Date | null;
}

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

interface FakePrismaClient {
  merchCampaign: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  merchMedia: {
    findMany: jest.Mock;
  };
  blogPost: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

function fakePrisma() {
  const state: {
    campaigns: FakeCampaignRow[];
    campaignById: FakeCampaignRow | null;
    blog: FakeBlogRow | null;
    media: Array<{
      id: string;
      originalName: string;
      createdBy: string | null;
      publishedAt: Date | null;
      deletedAt: Date | null;
    }>;
  } = {
    campaigns: [],
    campaignById: null,
    blog: null,
    media: [],
  };

  const client: FakePrismaClient = {
    merchCampaign: {
      findMany: jest.fn(async () => state.campaigns),
      findUnique: jest.fn(async () => state.campaignById),
    },
    merchMedia: {
      findMany: jest.fn(async ({ where }: { where?: { originalName?: string } }) =>
        state.media.filter(
          (row) => where?.originalName === undefined || row.originalName === where.originalName,
        ),
      ),
    },
    blogPost: {
      findUnique: jest.fn(async () => state.blog),
      findMany: jest.fn(
        async ({ where }: { where?: { slug?: string } } = {}) =>
          where?.slug === undefined
            ? [{ id: 'resolved-blog-id' }]
            : [{ id: `resolved-${where.slug}` }],
      ),
    },
    $transaction: jest.fn(
      async (fn: (tx: FakePrismaClient) => Promise<unknown>) => fn(client),
    ),
  };

  return {
    client: client as unknown as PrismaService,
    state,
    raw: client,
  };
}

function gatewayFixture(manifest: DemoSeedManifest = approvedManifest()) {
  const input = planInput(manifest, {
    options: options({ operationId: 'test-operation' }),
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
  const fake = fakePrisma();
  const fence: DemoSeedFence = {
    ownerToken: 'owner',
    generation: 1,
    operationId: input.options.operationId,
    lockWithinTransaction: async () => undefined,
  };
  const gateway = createPrismaDemoSeedWriteGateway({
    prisma: fake.client,
    fence,
    plan,
    planInput: input,
    intent,
    backup: {
      path: '/tmp/test-backup.json',
      checksum: 'a'.repeat(64),
      sizeBytes: 1,
    },
  });
  return { gateway, fake, input, plan, manifest };
}

function campaignDefinition(
  manifest: DemoSeedManifest,
  key: string,
): DemoCampaignDefinition {
  const definition = manifest.campaigns.find((item) => item.key === key);
  if (!definition) throw new Error(`missing campaign ${key}`);
  return definition;
}

function blogDefinition(
  manifest: DemoSeedManifest,
  key: string,
): DemoBlogArticleDefinition {
  const definition = manifest.blog.find((item) => item.key === key);
  if (!definition) throw new Error(`missing blog ${key}`);
  return definition;
}

function mediaDefinition(
  manifest: DemoSeedManifest,
  key: string,
): DemoMediaAssetDefinition {
  const definition = manifest.media.find((item) => item.key === key);
  if (!definition) throw new Error(`missing media ${key}`);
  return definition;
}

function ownedCampaign(
  definition: DemoCampaignDefinition,
  overrides: Partial<FakeCampaignRow> = {},
): FakeCampaignRow {
  return {
    id: 'campaign-id',
    internalName: definition.internalName,
    createdBy: DEMO_SEED_ACTOR_ID,
    updatedBy: null,
    archivedAt: null,
    ...overrides,
  };
}

function blogRow(
  definition: DemoBlogArticleDefinition,
  manifest: DemoSeedManifest,
  overrides: Partial<FakeBlogRow> = {},
): FakeBlogRow {
  const media = definition.coverAssetKey
    ? mediaDefinition(manifest, definition.coverAssetKey)
    : null;
  const coverImageUrl = media
    ? `https://shop.example.com/api/v1/catalog/merch-media/media-${media.key}`
    : null;
  return {
    id: 'blog-id',
    slug: definition.slug,
    status: BlogStatus.DRAFT,
    createdBy: DEMO_SEED_ACTOR_ID,
    updatedBy: null,
    publishedAt: null,
    title: definition.title,
    excerpt: definition.excerpt,
    content: definition.content,
    coverImageUrl,
    authorName: definition.authorName,
    metaTitle: null,
    metaDescription: null,
    categoryId: null,
    ...overrides,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('homepage demo seed write gateway campaign policy', () => {
  it('creates an absent campaign through the real gateway create branch', async () => {
    const { gateway, fake, manifest } = gatewayFixture();
    const definition = campaignDefinition(manifest, 'discovery');
    const created = ownedCampaign(definition);
    fake.state.campaignById = created;
    const create = jest
      .spyOn(CampaignService.prototype, 'create')
      .mockResolvedValue({ id: created.id } as never);

    const result = await gateway.upsertCampaign('discovery');

    expect(result).toEqual({ id: created.id, action: 'create' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      DEMO_SEED_ACTOR_ID,
      expect.objectContaining({
        internalName: definition.internalName,
        type: definition.type,
        titleFa: definition.copy.titleFa,
        media: [],
      }),
      undefined,
      expect.objectContaining({ ownerToken: 'owner', generation: 1 }),
    );
  });

  it('rejects an existing archived campaign without creating or updating it', async () => {
    const { gateway, fake, manifest } = gatewayFixture();
    const definition = campaignDefinition(manifest, 'discovery');
    fake.state.campaigns = [ownedCampaign(definition, { archivedAt: new Date() })];
    const create = jest.spyOn(CampaignService.prototype, 'create');
    const update = jest.spyOn(CampaignService.prototype, 'update');

    await expect(gateway.upsertCampaign('discovery')).rejects.toThrow(
      /archived/,
    );
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a manually edited campaign', async () => {
    const { gateway, fake, manifest } = gatewayFixture();
    const definition = campaignDefinition(manifest, 'discovery');
    fake.state.campaigns = [ownedCampaign(definition, { updatedBy: 'operator' })];
    const create = jest.spyOn(CampaignService.prototype, 'create');
    const update = jest.spyOn(CampaignService.prototype, 'update');

    await expect(gateway.upsertCampaign('discovery')).rejects.toThrow(
      /not safely demo-owned/,
    );
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an ambiguous campaign ownership result', async () => {
    const { gateway, fake, manifest } = gatewayFixture();
    const definition = campaignDefinition(manifest, 'discovery');
    fake.state.campaigns = [ownedCampaign(definition, { createdBy: 'operator' })];
    const create = jest.spyOn(CampaignService.prototype, 'create');
    const update = jest.spyOn(CampaignService.prototype, 'update');

    await expect(gateway.upsertCampaign('discovery')).rejects.toThrow(
      /not safely demo-owned/,
    );
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('updates an existing demo-owned campaign through the real gateway update branch', async () => {
    const { gateway, fake, manifest } = gatewayFixture();
    const definition = campaignDefinition(manifest, 'discovery');
    const existing = ownedCampaign(definition);
    fake.state.campaigns = [existing];
    fake.state.campaignById = existing;
    const update = jest
      .spyOn(CampaignService.prototype, 'update')
      .mockResolvedValue({ id: existing.id } as never);

    const result = await gateway.upsertCampaign('discovery');

    expect(result).toEqual({ id: existing.id, action: 'update' });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      existing.id,
      DEMO_SEED_ACTOR_ID,
      expect.objectContaining({ internalName: definition.internalName }),
      undefined,
      expect.objectContaining({ ownerToken: 'owner' }),
      expect.objectContaining({ beforeWrite: expect.any(Function) }),
    );
  });
});

describe('homepage demo seed write gateway blog slug policy', () => {
  it('passes the exact manifest slug to the explicit blog creation contract', async () => {
    const { gateway, fake, manifest } = gatewayFixture();
    const definition = blogDefinition(manifest, 'demo-article-1');
    const cover = mediaDefinition(manifest, definition.coverAssetKey!);
    fake.state.media = [
      {
        id: `media-${cover.key}`,
        originalName: expectedMediaOriginalName(cover),
        createdBy: DEMO_SEED_ACTOR_ID,
        publishedAt: null,
        deletedAt: null,
      },
    ];
    const create = jest
      .spyOn(BlogService.prototype, 'createPost')
      .mockResolvedValue({ id: 'blog-id' } as never);

    const result = await gateway.upsertBlogPost('demo-article-1');

    expect(result).toEqual({ id: 'blog-id', action: 'create' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![1]).toEqual(
      expect.objectContaining({
        slug: definition.slug,
        title: definition.title,
        status: BlogStatus.DRAFT,
      }),
    );
  });

  it('does not derive the manifest slug from a differently transliterated title', async () => {
    const manifest = approvedManifest();
    manifest.blog[0]!.title = 'عنوان فارسی کاملاً متفاوت';
    const { gateway, fake } = gatewayFixture(manifest);
    const definition = blogDefinition(manifest, 'demo-article-1');
    const cover = mediaDefinition(manifest, definition.coverAssetKey!);
    fake.state.media = [
      {
        id: `media-${cover.key}`,
        originalName: expectedMediaOriginalName(cover),
        createdBy: DEMO_SEED_ACTOR_ID,
        publishedAt: null,
        deletedAt: null,
      },
    ];
    const create = jest
      .spyOn(BlogService.prototype, 'createPost')
      .mockResolvedValue({ id: 'blog-id' } as never);

    await gateway.upsertBlogPost('demo-article-1');

    expect(create.mock.calls[0]![1]).toEqual(
      expect.objectContaining({ slug: definition.slug }),
    );
    expect(definition.slug).toBe('homepage-demo-article-1');
  });

  it('fails closed when the canonical slug belongs to a non-demo post', async () => {
    const { gateway, fake, manifest } = gatewayFixture();
    const definition = blogDefinition(manifest, 'demo-article-1');
    fake.state.blog = blogRow(definition, manifest, { createdBy: 'operator' });
    const create = jest.spyOn(BlogService.prototype, 'createPost');
    const update = jest.spyOn(BlogService.prototype, 'updatePost');

    await expect(gateway.upsertBlogPost('demo-article-1')).rejects.toThrow(
      /not safely demo-owned/,
    );
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('recovers an owned prior demo post by the manifest slug', async () => {
    const { gateway, fake, manifest } = gatewayFixture();
    const definition = blogDefinition(manifest, 'demo-article-1');
    const cover = mediaDefinition(manifest, definition.coverAssetKey!);
    fake.state.media = [
      {
        id: `media-${cover.key}`,
        originalName: expectedMediaOriginalName(cover),
        createdBy: DEMO_SEED_ACTOR_ID,
        publishedAt: null,
        deletedAt: null,
      },
    ];
    fake.state.blog = blogRow(definition, manifest);
    const update = jest
      .spyOn(BlogService.prototype, 'updatePost')
      .mockResolvedValue({ id: 'blog-id' } as never);
    const create = jest.spyOn(BlogService.prototype, 'createPost');

    const result = await gateway.upsertBlogPost('demo-article-1');

    expect(result).toEqual({ id: 'blog-id', action: 'update' });
    expect(update).toHaveBeenCalledWith(
      DEMO_SEED_ACTOR_ID,
      'blog-id',
      expect.objectContaining({ title: definition.title }),
      undefined,
      expect.objectContaining({ ownerToken: 'owner' }),
      expect.objectContaining({ beforeWrite: expect.any(Function) }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('resolves the same canonical manifest slug after creation', async () => {
    const { gateway, fake } = gatewayFixture();
    const resolve = (
      gateway as unknown as {
        resolveBlogIds(): Promise<Record<string, string>>;
      }
    ).resolveBlogIds.bind(gateway);

    await expect(resolve()).resolves.toEqual({
      'demo-article-1': 'resolved-homepage-demo-article-1',
      'demo-article-2': 'resolved-homepage-demo-article-2',
      'demo-article-3': 'resolved-homepage-demo-article-3',
    });
    expect(fake.raw.blogPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'homepage-demo-article-1' },
      }),
    );
  });
});
