import { Prisma } from '@prisma/client';
import {
  MERCH_HOMEPAGE_DRAFT_ID,
  type CatalogProductCardDto,
  type CatalogCategoryNode,
  type HomepageDraftSection,
} from '@sabz/types';
import type { PrismaService } from '../../../common/database/prisma.service';
import { PricingService } from '../../pricing/pricing.service';
import {
  PublicCatalogService,
} from '../../products/public-catalog.service';
import { ListCatalogProductsQueryDto } from '../../products/dto';
import {
  SS_245_POST_SLUG,
} from './constants';
import type {
  DemoBlogRow,
  DemoBrandCandidate,
  DemoCampaignRow,
  DemoCategoryCandidate,
  DemoDraftSnapshot,
  DemoMediaRow,
  DemoPublicationSnapshot,
  DemoSeedBaseline,
  DemoSeedReadRepository,
} from './types';

type ReadClient = Prisma.TransactionClient;

function parseSections(value: Prisma.JsonValue): HomepageDraftSection[] {
  return Array.isArray(value) ? (value as unknown as HomepageDraftSection[]) : [];
}

/**
 * Read-only projection over the Prisma client. The caller supplies a client
 * scoped to a database transaction that has been set READ ONLY.
 */
export class PrismaDemoSeedReadRepository implements DemoSeedReadRepository {
  private readonly catalog: PublicCatalogService;

  constructor(private readonly client: ReadClient) {
    const prismaLike = client as unknown as PrismaService;
    this.catalog = new PublicCatalogService(
      prismaLike,
      new PricingService(prismaLike),
    );
  }

  async readBaseline(): Promise<DemoSeedBaseline> {
    const [
      draftRow,
      publications,
      campaigns,
      merchMedia,
      publishedMerchMedia,
      blogPosts,
      publishedBlogPosts,
      products,
      publishedProducts,
    ] = await Promise.all([
      this.client.homepageDraft.findUnique({
        where: { id: MERCH_HOMEPAGE_DRAFT_ID },
        select: {
          revision: true,
          schemaVersion: true,
          sections: true,
          updatedAt: true,
        },
      }),
      this.client.homepagePublication.findMany({
        orderBy: { version: 'asc' },
        select: {
          id: true,
          version: true,
          status: true,
          publishedAt: true,
        },
      }),
      this.client.merchCampaign.count(),
      this.client.merchMedia.count(),
      this.client.merchMedia.count({
        where: { deletedAt: null, publishedAt: { not: null } },
      }),
      this.client.blogPost.count(),
      this.client.blogPost.count({ where: { status: 'PUBLISHED' } }),
      this.client.product.count(),
      this.client.product.count({
        where: { deletedAt: null, status: 'PUBLISHED' },
      }),
    ]);

    const draft: DemoDraftSnapshot | null = draftRow
      ? {
          revision: draftRow.revision,
          schemaVersion: draftRow.schemaVersion,
          sections: parseSections(draftRow.sections),
          updatedAt: draftRow.updatedAt.toISOString(),
        }
      : null;

    return {
      draft,
      publications: publications.map(
        (row): DemoPublicationSnapshot => ({
          id: row.id,
          version: row.version,
          status: row.status,
          publishedAt: row.publishedAt?.toISOString() ?? null,
        }),
      ),
      counts: {
        campaigns,
        merchMedia,
        publishedMerchMedia,
        blogPosts,
        publishedBlogPosts,
        products,
        publishedProducts,
      },
    };
  }

  async readCampaignsByInternalNames(
    internalNames: string[],
  ): Promise<DemoCampaignRow[]> {
    if (internalNames.length === 0) return [];
    return this.client.merchCampaign.findMany({
      where: { internalName: { in: internalNames } },
      select: {
        id: true,
        internalName: true,
        createdBy: true,
        updatedBy: true,
      },
    });
  }

  async readBlogPostsBySlugs(slugs: string[]): Promise<DemoBlogRow[]> {
    if (slugs.length === 0) return [];
    const rows = await this.client.blogPost.findMany({
      where: { slug: { in: slugs } },
      select: {
        id: true,
        slug: true,
        status: true,
        createdBy: true,
        updatedBy: true,
        publishedAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    }));
  }

  async readMediaByOriginalNames(
    originalNames: string[],
  ): Promise<DemoMediaRow[]> {
    if (originalNames.length === 0) return [];
    const rows = await this.client.merchMedia.findMany({
      where: { originalName: { in: originalNames } },
      select: {
        id: true,
        originalName: true,
        createdBy: true,
        publishedAt: true,
        deletedAt: true,
        sourceSha256: true,
        processedSha256: true,
        thumbnailSha256: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
    }));
  }

  async readPublishedMedia(): Promise<DemoMediaRow[]> {
    const rows = await this.client.merchMedia.findMany({
      where: { publishedAt: { not: null } },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        originalName: true,
        createdBy: true,
        publishedAt: true,
        deletedAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
    }));
  }

  async readProducts(limit: number): Promise<CatalogProductCardDto[]> {
    const query = new ListCatalogProductsQueryDto();
    query.page = 1;
    query.limit = limit;
    query.sort = 'newest';
    query.inStockOnly = true;
    const result = await this.catalog.listProducts(query);
    return result.items;
  }

  async readProductsBySlugs(
    slugs: string[],
  ): Promise<CatalogProductCardDto[]> {
    if (slugs.length === 0) return [];
    const rows = await this.client.product.findMany({
      where: {
        slug: { in: slugs },
        status: 'PUBLISHED',
        deletedAt: null,
      },
      select: { id: true, slug: true },
    });
    const cards = await this.catalog.getVisibleCardsByIds(
      rows.map((row) => row.id),
    );
    const byId = new Map(cards.map((card) => [card.id, card]));
    return slugs.flatMap((slug) => {
      const row = rows.find((item) => item.slug === slug);
      const card = row ? byId.get(row.id) : undefined;
      return card ? [card] : [];
    });
  }

  async readCategories(limit: number): Promise<DemoCategoryCandidate[]> {
    const tree = await this.catalog.getCategoryTree();
    // The single root category ("کالای دیجیتال") is a catalog container, not a
    // useful discovery tile. Use its top-level children when it has them.
    const selectable =
      tree.length === 1 && tree[0]!.children.length > 0
        ? tree[0]!.children
        : tree;
    return selectable
      .filter((category) => category.publishedProductCount > 0)
      .sort(
        (a, b) =>
          b.publishedProductCount - a.publishedProductCount ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, limit)
      .map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        publishedProductCount: category.publishedProductCount,
      }));
  }

  async readBrands(
    limit: number,
    perBrand: number,
  ): Promise<{
    brands: DemoBrandCandidate[];
    productsByBrand: Record<string, CatalogProductCardDto[]>;
  }> {
    const rows = await this.client.brand.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: {
          select: {
            products: {
              where: { deletedAt: null, status: 'PUBLISHED' },
            },
          },
        },
      },
    });
    const brands = rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        publishedProductCount: row._count.products,
      }))
      .filter((brand) => brand.publishedProductCount > 0)
      .sort(
        (a, b) =>
          b.publishedProductCount - a.publishedProductCount ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, limit);

    const productsByBrand: Record<string, CatalogProductCardDto[]> = {};
    for (const brand of brands) {
      const query = new ListCatalogProductsQueryDto();
      query.page = 1;
      query.limit = perBrand;
      query.sort = 'newest';
      query.brand = brand.slug;
      const result = await this.catalog.listProducts(query);
      productsByBrand[brand.slug] = result.items;
    }
    return { brands, productsByBrand };
  }

  async readSs245Post(): Promise<DemoBlogRow | null> {
    const row = await this.client.blogPost.findUnique({
      where: { slug: SS_245_POST_SLUG },
      select: {
        id: true,
        slug: true,
        status: true,
        createdBy: true,
        updatedBy: true,
        publishedAt: true,
      },
    });
    return row
      ? {
          ...row,
          publishedAt: row.publishedAt?.toISOString() ?? null,
        }
      : null;
  }
}

export function flattenCategories(
  nodes: CatalogCategoryNode[],
): CatalogCategoryNode[] {
  const result: CatalogCategoryNode[] = [];
  const visit = (node: CatalogCategoryNode): void => {
    result.push(node);
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const node of nodes) visit(node);
  return result;
}
