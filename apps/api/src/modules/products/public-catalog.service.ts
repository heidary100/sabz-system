import { Injectable, NotFoundException } from '@nestjs/common';
import { PriceStatus, Prisma, ProductStatus } from '@prisma/client';
import type {
  CatalogBrandDto,
  CatalogCategoryCrumb,
  CatalogCategoryNode,
  CatalogProductCardDto,
  CatalogProductDetailDto,
  CatalogProductMediaDto,
  CatalogProductSpecDto,
  CatalogProductVariantDto,
  CatalogRefDto,
  PaginatedResult,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import {
  activeInventoryWhere,
  deriveAvailable,
} from '../inventory/inventory-aggregate';
import {
  ListCatalogBrandsQueryDto,
  ListCatalogProductsQueryDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * Server-provided public URL of a stored (watermarked) media asset (SS-123).
 * Relative so it stays host-agnostic; each frontend resolves it against the
 * API base URL.
 */
const PUBLIC_MEDIA_URL_PREFIX = '/api/v1/catalog/media';

/**
 * Public, read-only catalog projections (SS-120/SS-121/SS-122).
 *
 * Only PUBLISHED, non-soft-deleted products and visible, non-soft-deleted
 * categories/brands are ever exposed. Availability comes exclusively from the
 * inventory read aggregate (SS-112 semantics, `activeInventoryWhere`), the
 * single source of availability since SS-130 removed the legacy
 * `ProductVariant.stockQuantity` column. Media URLs point at
 * the public media endpoint; storage keys are never exposed.
 */
@Injectable()
export class PublicCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Visible category tree with per-node published-product counts rolled up
   * from descendants (SS-205). A parent therefore shows the size of its
   * whole subtree, not just directly-assigned products. Hidden categories
   * are excluded from the tree entirely, so products under hidden branches
   * never roll up — hidden means hidden from storefront navigation.
   * Categories whose parent is hidden or missing are promoted to roots so
   * their subtree stays reachable in navigation.
   */
  async getCategoryTree(): Promise<CatalogCategoryNode[]> {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null, isVisible: true },
      select: { id: true, name: true, slug: true, sortOrder: true, parentId: true },
      orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }, { id: 'asc' as const }],
    });
    const counts = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: {
        deletedAt: null,
        status: ProductStatus.PUBLISHED,
      },
      _count: { id: true },
    });

    const countByCategory = new Map(
      counts.map((row) => [row.categoryId, row._count.id]),
    );

    interface TreeNode extends Omit<CatalogCategoryNode, 'children'> {
      parentId: string | null;
      children: TreeNode[];
    }

    const nodes = new Map<string, TreeNode>(
      categories.map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name,
          slug: row.slug,
          sortOrder: row.sortOrder,
          publishedProductCount: countByCategory.get(row.id) ?? 0,
          parentId: row.parentId,
          children: [],
        },
      ]),
    );

    const roots: TreeNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // Roll up descendant counts post-order so parents reflect subtree size.
    const accumulate = (node: TreeNode): number => {
      for (const child of node.children) {
        node.publishedProductCount += accumulate(child);
      }
      return node.publishedProductCount;
    };
    for (const root of roots) {
      accumulate(root);
    }

    const strip = (node: TreeNode): CatalogCategoryNode => ({
      id: node.id,
      name: node.name,
      slug: node.slug,
      sortOrder: node.sortOrder,
      publishedProductCount: node.publishedProductCount,
      children: node.children
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder ||
            a.name.localeCompare(b.name) ||
            a.id.localeCompare(b.id),
        )
        .map(strip),
    });

    return roots
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      )
      .map(strip);
  }

  async listBrands(
    query: ListCatalogBrandsQueryDto,
  ): Promise<PaginatedResult<CatalogBrandDto>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const where: Prisma.BrandWhereInput = { deletedAt: null };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({
        where,
        select: { id: true, name: true, slug: true },
        orderBy: [{ name: 'asc' as const }, { id: 'asc' as const }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { items: rows, total, page, limit };
  }

  async listProducts(
    query: ListCatalogProductsQueryDto,
  ): Promise<PaginatedResult<CatalogProductCardDto>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const where = await this.productVisibilityWhere(query);

    const total = await this.prisma.product.count({ where });

    let pageIds: string[];
    if (query.sort === 'price_asc' || query.sort === 'price_desc') {
      // Ordering by minimum variant price is not expressible as a Prisma
      // orderBy, so the matching set is sorted in memory. The full matching
      // (id, prices) tuple set is loaded — acceptable at catalog scale and
      // the documented trigger for the Decision-5 minPrice denormalization.
      const candidates = await this.prisma.product.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          variants: {
            where: { deletedAt: null },
            select: { price: true, priceStatus: true },
          },
        },
      });
      const direction = query.sort === 'price_asc' ? 1 : -1;
      pageIds = candidates
        .map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          minPrice: minPriceOf(row.variants),
        }))
        .sort((a, b) => {
          if (a.minPrice === null && b.minPrice === null) {
            return b.createdAt.getTime() - a.createdAt.getTime();
          }
          if (a.minPrice === null) return 1;
          if (b.minPrice === null) return -1;
          return (
            direction * a.minPrice.comparedTo(b.minPrice) ||
            b.createdAt.getTime() - a.createdAt.getTime()
          );
        })
        .slice((page - 1) * limit, page * limit)
        .map((row) => row.id);
    } else {
      const rows = await this.prisma.product.findMany({
        where,
        select: { id: true },
        orderBy:
          query.sort === 'name'
            ? [{ name: 'asc' as const }, { id: 'asc' as const }]
            : [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        skip: (page - 1) * limit,
        take: limit,
      });
      pageIds = rows.map((row) => row.id);
    }

    if (pageIds.length === 0) {
      return { items: [], total, page, limit };
    }

    const cards = await this.hydrateCards(pageIds);
    return { items: cards, total, page, limit };
  }

  async getProductBySlug(slug: string): Promise<CatalogProductDetailDto> {
    const product = await this.prisma.product.findFirst({
      where: { slug, deletedAt: null, status: ProductStatus.PUBLISHED },
      select: {
        id: true,
        name: true,
        slug: true,
        nameEn: true,
        subtitle: true,
        shortDescription: true,
        description: true,
        condition: true,
        warranty: true,
        metaTitle: true,
        metaDescription: true,
        weightKg: true,
        widthCm: true,
        heightCm: true,
        depthCm: true,
        originCountry: true,
        createdAt: true,
        brand: { select: { name: true, slug: true } },
        category: {
          select: { id: true, name: true, slug: true, parentId: true },
        },
        variants: {
          where: { deletedAt: null },
          select: {
            id: true,
            sku: true,
            name: true,
            price: true,
            compareAtPrice: true,
            priceStatus: true,
          },
          orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        },
        media: {
          where: publicMediaWhere(),
          select: {
            id: true,
            mediaType: true,
            isPrimary: true,
            sortOrder: true,
            thumbnailKey: true,
          },
          orderBy: [
            { isPrimary: 'desc' as const },
            { sortOrder: 'asc' as const },
            { createdAt: 'asc' as const },
          ],
        },
        specs: {
          select: {
            sortOrder: true,
            attributeValue: {
              select: {
                value: true,
                slug: true,
                attribute: {
                  select: { name: true, slug: true, group: true },
                },
              },
            },
          },
          orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
        },
        tags: {
          select: {
            tag: { select: { name: true, slug: true } },
          },
          orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
        },
      },
    });

    if (!product) {
      throw new NotFoundException('محصول یافت نشد.');
    }

    const availableByVariant = await this.availableByVariant(
      product.variants.map((variant) => variant.id),
    );

    const variants: CatalogProductVariantDto[] = product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      price: String(variant.price),
      compareAtPrice:
        variant.compareAtPrice === null ? null : String(variant.compareAtPrice),
      priceStatus: variant.priceStatus,
      inStock: (availableByVariant.get(variant.id) ?? 0) > 0,
    }));

    const media: CatalogProductMediaDto[] = product.media.map((row) => ({
      id: row.id,
      mediaType: row.mediaType,
      url: `${PUBLIC_MEDIA_URL_PREFIX}/${row.id}`,
      thumbnailUrl:
        row.thumbnailKey !== null
          ? `${PUBLIC_MEDIA_URL_PREFIX}/${row.id}/thumbnail`
          : null,
      isPrimary: row.isPrimary,
      sortOrder: row.sortOrder,
    }));

    const specs: CatalogProductSpecDto[] = product.specs.map((row) => ({
      attributeName: row.attributeValue.attribute.name,
      attributeSlug: row.attributeValue.attribute.slug,
      attributeGroup: row.attributeValue.attribute.group,
      value: row.attributeValue.value,
      valueSlug: row.attributeValue.slug,
      sortOrder: row.sortOrder,
    }));

    const tags: CatalogRefDto[] = product.tags.map((row) => row.tag);

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      nameEn: product.nameEn,
      subtitle: product.subtitle,
      shortDescription: product.shortDescription,
      description: product.description,
      condition: product.condition,
      warranty: product.warranty,
      metaTitle: product.metaTitle,
      metaDescription: product.metaDescription,
      weightKg: decimalToString(product.weightKg),
      widthCm: decimalToString(product.widthCm),
      heightCm: decimalToString(product.heightCm),
      depthCm: decimalToString(product.depthCm),
      originCountry: product.originCountry,
      brand: product.brand,
      category: { name: product.category.name, slug: product.category.slug },
      categoryBreadcrumb: await this.categoryBreadcrumb(product.category.id),
      variants,
      media,
      specs,
      tags,
      inStock: variants.some((variant) => variant.inStock),
      createdAt: product.createdAt.toISOString(),
    };
  }

  /** Visibility + public filters shared by count and page queries. */
  private async productVisibilityWhere(
    query: ListCatalogProductsQueryDto,
  ): Promise<Prisma.ProductWhereInput> {
    return {
      deletedAt: null,
      status: ProductStatus.PUBLISHED,
      ...(query.category && {
        categoryId: { in: await this.categorySubtreeIds(query.category) },
      }),
      ...(query.brand && {
        brand: { is: { slug: query.brand, deletedAt: null } },
      }),
      ...(query.condition && { condition: query.condition }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' as const } },
          { slug: { contains: query.q, mode: 'insensitive' as const } },
        ],
      }),
    };
  }

  /**
   * Live category ids of a slug's subtree, root first (SS-205). The listing
   * `category` filter matches the whole subtree, so parent landing pages
   * include descendant products. Unknown slugs resolve to [] (matches
   * nothing, like the old exact-match miss). Hidden categories stay
   * included here — the filter never had a visibility gate, only the tree
   * does; changing that is out of scope.
   *
   * Single indexed query + in-memory walk: easily fast into the low
   * thousands of categories; revisit with a recursive CTE past that.
   */
  private async categorySubtreeIds(slug: string): Promise<string[]> {
    const rows = await this.prisma.category.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true, parentId: true },
    });
    const root = rows.find((row) => row.slug === slug);
    if (!root) {
      return [];
    }
    const childrenByParent = new Map<string, string[]>();
    for (const row of rows) {
      if (row.parentId !== null) {
        const list = childrenByParent.get(row.parentId) ?? [];
        list.push(row.id);
        childrenByParent.set(row.parentId, list);
      }
    }
    const ids = [root.id];
    const queue = [root.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const child of childrenByParent.get(current) ?? []) {
        ids.push(child);
        queue.push(child);
      }
    }
    return ids;
  }

  /** Builds the listing cards for an already-paginated, ordered id list. */
  private async hydrateCards(
    pageIds: string[],
  ): Promise<CatalogProductCardDto[]> {
    const [rows, priceRows] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: pageIds } },
        select: {
          id: true,
          name: true,
          slug: true,
          condition: true,
          brand: { select: { name: true, slug: true } },
          category: { select: { name: true, slug: true } },
          variants: {
            where: { deletedAt: null },
            select: { id: true },
            orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
          },
          media: {
            where: publicMediaWhere({ mediaType: 'IMAGE' }),
            select: { id: true, thumbnailKey: true },
            orderBy: [
              { isPrimary: 'desc' as const },
              { sortOrder: 'asc' as const },
              { createdAt: 'asc' as const },
            ],
            take: 1,
          },
        },
      }),
      this.prisma.productVariant.groupBy({
        by: ['productId'],
        where: {
          productId: { in: pageIds },
          deletedAt: null,
          priceStatus: PriceStatus.PRICED,
        },
        _min: { price: true },
      }),
    ]);

    const minPriceByProduct = new Map(
      priceRows.map((row) => [row.productId, row._min.price]),
    );

    // Collect every live variant of the page once for the availability map.
    const variantIds = rows.flatMap((row) => row.variants.map((v) => v.id));
    const availableByVariant = await this.availableByVariant(variantIds);

    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const cards: CatalogProductCardDto[] = [];
    for (const id of pageIds) {
      const row = rowsById.get(id);
      if (!row) {
        continue;
      }
      const minPrice = minPriceByProduct.get(id) ?? null;
      cards.push({
        id: row.id,
        name: row.name,
        slug: row.slug,
        condition: row.condition,
        brand: row.brand,
        category: row.category,
        priceFrom: minPrice === null ? '' : String(minPrice),
        callForPrice: minPrice === null,
        variantCount: row.variants.length,
        inStock: row.variants.some(
          (variant) => (availableByVariant.get(variant.id) ?? 0) > 0,
        ),
        primaryImageUrl:
          row.media.length > 0
            ? `${PUBLIC_MEDIA_URL_PREFIX}/${row.media[0]!.id}`
            : null,
        primaryThumbnailUrl:
          row.media.length > 0 && row.media[0]!.thumbnailKey !== null
            ? `${PUBLIC_MEDIA_URL_PREFIX}/${row.media[0]!.id}/thumbnail`
            : null,
      });
    }
    return cards;
  }

  /**
   * Available (onHand − reserved) stock per variant across active warehouses,
   * using the exact SS-112 operational predicate so catalog availability can
   * never drift from the inventory read API.
   */
  private async availableByVariant(
    variantIds: string[],
  ): Promise<Map<string, number>> {
    if (variantIds.length === 0) {
      return new Map();
    }
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        variantId: { in: variantIds },
        ...activeInventoryWhere(),
      },
      select: {
        variantId: true,
        quantityOnHand: true,
        quantityReserved: true,
      },
    });

    const totals = new Map<string, number>();
    for (const item of items) {
      const available = deriveAvailable(
        item.quantityOnHand,
        item.quantityReserved,
      );
      totals.set(item.variantId, (totals.get(item.variantId) ?? 0) + available);
    }
    return totals;
  }

  /** Root-first ancestry chain of the leaf category (non-deleted only). */
  private async categoryBreadcrumb(
    categoryId: string,
  ): Promise<CatalogCategoryCrumb[]> {
    interface CrumbSource {
      name: string;
      slug: string;
      parentId: string | null;
      deletedAt: Date | null;
    }
    const crumbs: CatalogCategoryCrumb[] = [];
    let currentId: string | null = categoryId;
    while (currentId !== null) {
      const category: CrumbSource | null = await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { name: true, slug: true, parentId: true, deletedAt: true },
      });
      if (!category || category.deletedAt !== null) {
        break;
      }
      crumbs.unshift({ name: category.name, slug: category.slug });
      currentId = category.parentId;
    }
    return crumbs;
  }
}

function minPriceOf(
  variants: Array<{ price: Prisma.Decimal; priceStatus: PriceStatus }>,
): Prisma.Decimal | null {
  let min: Prisma.Decimal | null = null;
  for (const variant of variants) {
    // CALL_FOR_PRICE rows carry a placeholder price (SS-201): they must never
    // influence sorting or the displayed minimum.
    if (variant.priceStatus !== PriceStatus.PRICED) {
      continue;
    }
    if (min === null || variant.price.comparedTo(min) < 0) {
      min = variant.price;
    }
  }
  return min;
}

function decimalToString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : String(value);
}

/**
 * Public media scope: active media of the product; variant-scoped media is
 * hidden together with a soft-deleted variant — mirroring the SS-123 public
 * media endpoint exactly, so a card/detail URL can never 404 after a variant
 * deletion.
 */
function publicMediaWhere(
  extra?: Prisma.ProductMediaWhereInput,
): Prisma.ProductMediaWhereInput {
  return {
    deletedAt: null,
    OR: [{ variantId: null }, { variant: { is: { deletedAt: null } } }],
    ...extra,
  };
}
