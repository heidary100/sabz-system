import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PriceStatus, Prisma, ProductStatus, ReviewStatus } from '@prisma/client';
import { tokenizeQuery } from '@sabz/search';
import type {
  CatalogBrandDto,
  CatalogCategoryCoverDto,
  CatalogCategoryCrumb,
  CatalogCategoryNode,
  CatalogCompareResponse,
  CatalogFacetsResponse,
  CatalogPriceQuoteDto,
  CatalogPriceResponseDto,
  CatalogProductCardDto,
  CatalogProductDetailDto,
  CatalogProductMediaDto,
  CatalogProductSpecDto,
  CatalogProductVariantDto,
  CatalogRefDto,
  PaginatedResult,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { roundRialUp, roundedCompareAt } from '../../common/money/rial';
import {
  activeInventoryWhere,
  deriveAvailable,
} from '../inventory/inventory-aggregate';
import { PricingService } from '../pricing/pricing.service';
import { roundRatingAverage } from '../reviews/reviews.service';
import { AttributesService } from './attributes.service';
import {
  ListCatalogBrandsQueryDto,
  ListCatalogProductsQueryDto,
} from './dto';
import {
  searchCatalogProducts,
  type CatalogSearchFilters,
  type CatalogSearchSort,
} from './public-catalog-search';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/** Bounded batch size for the derived category-cover lookup (Task 03). */
export const CATEGORY_COVER_MAX = 12;
const CATEGORY_COVER_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Server-provided public URL of a stored (watermarked) media asset (SS-123).
 * Relative so it stays host-agnostic; each frontend resolves it against the
 * API base URL.
 */
export const PUBLIC_MEDIA_URL_PREFIX = '/api/v1/catalog/media';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly attributes: AttributesService,
  ) {}

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


  /**
   * Derived navigation covers (Task 03).
   *
   * One bounded raw query resolves every requested visible category subtree,
   * picks the newest PUBLISHED product with a public primary image, and
   * returns that image. This is intentionally a representative product
   * image, never an editorial category photograph. Unknown/invalid/invisible
   * slugs are omitted; a resolved visible category with no eligible image is
   * returned with `imageUrl: null`.
   */
  async getCategoryCovers(
    slugsRaw: string | undefined,
  ): Promise<CatalogCategoryCoverDto[]> {
    const slugs = [
      ...new Set(
        (slugsRaw ?? '')
          .split(',')
          .map((slug) => slug.trim())
          .filter(
            (slug) =>
              slug.length > 0 &&
              slug.length <= 200 &&
              CATEGORY_COVER_SLUG.test(slug),
          ),
      ),
    ].slice(0, CATEGORY_COVER_MAX + 1);

    if (slugs.length === 0) {
      return [];
    }
    if (slugs.length > CATEGORY_COVER_MAX) {
      throw new BadRequestException(
        `حداکثر ${CATEGORY_COVER_MAX} دسته‌بندی در هر درخواست مجاز است.`,
      );
    }

    const slugParams = Prisma.join(
      slugs.map((slug) => Prisma.sql`${slug}`),
    );

    const rows = await this.prisma.$queryRaw<
      Array<{
        slug: string;
        name: string;
        mediaId: string | null;
        thumbnailKey: string | null;
      }>
    >(Prisma.sql`
      WITH RECURSIVE requested AS (
        SELECT c.id, c.slug, c.name
        FROM "Category" c
        WHERE c."deletedAt" IS NULL
          AND c."isVisible" = true
          AND c.slug IN (${slugParams})
      ),
      subtree AS (
        SELECT r.id AS root_id, r.slug, r.name, r.id AS category_id
        FROM requested r
        UNION ALL
        SELECT s.root_id, s.slug, s.name, child.id
        FROM subtree s
        JOIN "Category" child ON child."parentId" = s.category_id
        WHERE child."deletedAt" IS NULL
          AND child."isVisible" = true
      ),
      candidates AS (
        SELECT DISTINCT ON (s.root_id)
          s.root_id,
          s.slug,
          s.name,
          pm.id AS media_id,
          pm."thumbnailKey" AS thumbnail_key
        FROM subtree s
        JOIN "Product" p ON p."categoryId" = s.category_id
        JOIN "ProductMedia" pm ON pm."productId" = p.id
        LEFT JOIN "ProductVariant" v ON v.id = pm."variantId"
        WHERE p."deletedAt" IS NULL
          AND p.status = 'PUBLISHED'
          AND pm."deletedAt" IS NULL
          AND pm."mediaType" = 'IMAGE'
          AND (pm."variantId" IS NULL OR v."deletedAt" IS NULL)
        ORDER BY
          s.root_id,
          p."createdAt" DESC,
          p.id DESC,
          pm."isPrimary" DESC,
          pm."sortOrder" ASC,
          pm."createdAt" ASC
      )
      SELECT
        r.slug,
        r.name,
        c.media_id AS "mediaId",
        c.thumbnail_key AS "thumbnailKey"
      FROM requested r
      LEFT JOIN candidates c ON c.root_id = r.id
    `);

    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    return slugs.flatMap((slug) => {
      const row = bySlug.get(slug);
      if (!row) {
        return [];
      }
      const imageUrl = row.mediaId
        ? row.thumbnailKey
          ? `${PUBLIC_MEDIA_URL_PREFIX}/${row.mediaId}/thumbnail`
          : `${PUBLIC_MEDIA_URL_PREFIX}/${row.mediaId}`
        : null;
      return [
        {
          slug,
          imageUrl,
          alt: `تصویر دسته‌بندی ${row.name}`,
        },
      ];
    });
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
        select: {
          id: true,
          name: true,
          slug: true,
          // SS-226: facet counts — published, non-deleted products per brand,
          // the same visibility predicate the product listing applies.
          _count: {
            select: {
              products: { where: { deletedAt: null, status: 'PUBLISHED' } },
            },
          },
        },
        orderBy: [{ name: 'asc' as const }, { id: 'asc' as const }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items: CatalogBrandDto[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      productCount: row._count.products,
    }));

    return { items, total, page, limit };
  }

  /**
   * SS-258: a soft-deleted duplicate's historical slug resolves to its
   * canonical brand. Active slugs pass through; unknown/unlinked deleted
   * slugs stay unresolved and therefore match no products.
   */
  private async resolveMergedBrandSlug(slug: string): Promise<string | null> {
    const brand = await this.prisma.brand.findUnique({
      where: { slug },
      select: {
        slug: true,
        deletedAt: true,
        mergedIntoBrandId: true,
      },
    });
    if (!brand) {
      return null;
    }
    if (brand.deletedAt === null) {
      return brand.slug;
    }
    if (brand.mergedIntoBrandId === null) {
      return null;
    }
    const canonical = await this.prisma.brand.findUnique({
      where: { id: brand.mergedIntoBrandId },
      select: { slug: true, deletedAt: true },
    });
    return canonical !== null && canonical.deletedAt === null
      ? canonical.slug
      : null;
  }

  async listProducts(
    query: ListCatalogProductsQueryDto,
  ): Promise<PaginatedResult<CatalogProductCardDto>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const resolvedBrand = query.brand
      ? await this.resolveMergedBrandSlug(query.brand)
      : null;
    if (resolvedBrand !== null && resolvedBrand !== query.brand) {
      query = { ...query, brand: resolvedBrand };
    }

    // SS-216: a meaningful q routes to the PostgreSQL search query; the
    // q-less Prisma path below stays byte-for-byte the pre-SS-216 behavior.
    // A q that tokenizes to nothing (whitespace/diacritics-only) is treated
    // as absent — never a `contains '   '` predicate.
    const tokens = tokenizeQuery(query.q ?? '');
    if (tokens.length > 0) {
      return this.searchProducts(tokens, query, page, limit);
    }
    if (query.q !== undefined) {
      query = { ...query, q: undefined };
    }

    let where = await this.productVisibilityWhere(query);

    // Stock narrowing feeds product ids into the SAME visibility query, so
    // totals, pagination, sorting, and the category-subtree scope stay exact.
    // The rating facet (SS-236) joins the same mechanism; when both are
    // present the id sets intersect (a cheap well-rated variant cannot
    // qualify an out-of-stock product, and vice versa). Price uses the same
    // product-id scope so the bound matches the customer-visible rounded
    // amount rather than the raw stored Decimal.
    const priceRange = normalizedPriceRange(query);
    if (
      query.inStockOnly ||
      query.rating !== undefined ||
      priceRange.from !== undefined ||
      priceRange.to !== undefined
    ) {
      let ids: Set<string> | null = null;
      if (priceRange.from !== undefined || priceRange.to !== undefined) {
        ids = new Set(
          await this.roundedPriceProductIds(priceRange),
        );
      }
      if (query.inStockOnly) {
        const stock = new Set(await this.inStockProductIds(query));
        ids = ids === null ? stock : new Set([...ids].filter((id) => stock.has(id)));
      }
      if (query.rating !== undefined) {
        const rated = new Set(await this.ratingProductIds(query.rating));
        ids = ids === null ? rated : new Set([...ids].filter((id) => rated.has(id)));
      }
      where = { ...where, id: { in: [...ids!] } };
    }

    const total = await this.prisma.product.count({ where });

    let pageIds: string[];
    if (query.sort === 'price_asc' || query.sort === 'price_desc') {
      // SS-217: PostgreSQL orders by the denormalized Product.minPrice — the
      // pre-SS-217 implementation loaded every matching (id, createdAt,
      // variants) tuple and sorted in JavaScript. NULLs last in BOTH
      // directions and the newest-first tie-break preserve the old contract;
      // the (minPrice, createdAt DESC, id DESC) key is byte-identical to the
      // SS-216 search-path ordering.
      const rows = await this.prisma.product.findMany({
        where,
        select: { id: true },
        orderBy: [
          {
            minPrice: {
              sort: query.sort === 'price_asc' ? 'asc' : 'desc',
              nulls: 'last',
            },
          },
          { createdAt: 'desc' as const },
          { id: 'desc' as const },
        ],
        skip: (page - 1) * limit,
        take: limit,
      });
      pageIds = rows.map((row) => row.id);
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

  /**
   * Search path for a meaningful `q` (SS-216): id selection + relevance
   * ranking come from the PostgreSQL search query (public-catalog-search),
   * while every filter the service already owns keeps its existing
   * implementation — the category-subtree walk, the inventory-truth in-stock
   * prefilter, and the price-range normalization are computed here and passed
   * into the SQL as data, never re-implemented in SQL.
   *
   * Prefilter scopes use the q-LESS visibility (the token matching happens in
   * the search SQL with the widened corpus), and empty scopes match nothing —
   * the same convention as unknown category slugs. Ranking is primary only
   * when the user did not pick an explicit sort (default/`newest`);
   * price/name sorts override relevance, mirroring the q-less ordering
   * semantics. Cards hydrate through the shared `hydrateCards()` pipeline.
   */
  private async searchProducts(
    tokens: string[],
    query: ListCatalogProductsQueryDto,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<CatalogProductCardDto>> {
    const empty: PaginatedResult<CatalogProductCardDto> = {
      items: [],
      total: 0,
      page,
      limit,
    };
    const scopeQuery: ListCatalogProductsQueryDto = { ...query, q: undefined };

    const filters: CatalogSearchFilters = {};
    if (query.category) {
      const subtreeIds = await this.categorySubtreeIds(query.category);
      if (subtreeIds.length === 0) {
        return empty;
      }
      filters.categoryIds = subtreeIds;
    }
    if (query.inStockOnly) {
      const stockProductIds = await this.inStockProductIds(scopeQuery);
      if (stockProductIds.length === 0) {
        return empty;
      }
      filters.stockProductIds = stockProductIds;
    }
    if (query.rating !== undefined) {
      const ratingProductIds = await this.ratingProductIds(query.rating);
      if (ratingProductIds.length === 0) {
        return empty;
      }
      filters.ratingProductIds = ratingProductIds;
    }
    // SS-900: attribute filters are resolved to a product-id scope so the
    // SQL search path and the Prisma listing path share exact semantics.
    const attributeWhere = await this.attributeFilterWhere(scopeQuery);
    let scopedProductIds: Set<string> | null = null;
    if (attributeWhere) {
      const rows = await this.prisma.product.findMany({
        where: {
          ...(await this.visibleProductWhere(scopeQuery)),
          ...attributeWhere,
        },
        select: { id: true },
      });
      if (rows.length === 0) {
        return empty;
      }
      scopedProductIds = new Set(rows.map((row) => row.id));
    }
    if (filters.stockProductIds) {
      const stock = new Set(filters.stockProductIds);
      scopedProductIds =
        scopedProductIds === null
          ? stock
          : new Set([...scopedProductIds].filter((id) => stock.has(id)));
    }
    if (scopedProductIds) {
      if (scopedProductIds.size === 0) {
        return empty;
      }
      filters.stockProductIds = [...scopedProductIds];
    }
    if (query.brand) {
      filters.brandSlug = query.brand;
    }
    if (query.condition) {
      filters.condition = query.condition;
    }
    const range = normalizedPriceRange(query);
    if (range.from !== undefined) {
      filters.priceFrom = String(range.from);
    }
    if (range.to !== undefined) {
      filters.priceTo = String(range.to);
    }

    const sort: CatalogSearchSort =
      query.sort === 'name'
        ? 'name'
        : query.sort === 'price_asc'
          ? 'price_asc'
          : query.sort === 'price_desc'
            ? 'price_desc'
            : 'relevance';

    const { total, pageIds } = await searchCatalogProducts(this.prisma, {
      tokens,
      filters,
      sort,
      page,
      limit,
    });

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
        brandId: true,
        categoryId: true,
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
            options: {
              select: {
                attributeValue: {
                  select: {
                    value: true,
                    slug: true,
                    attribute: { select: { name: true, slug: true } },
                  },
                },
              },
            },
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
            variantId: true,
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
            valueText: true,
            valueNumber: true,
            valueBoolean: true,
            attribute: {
              select: {
                id: true,
                name: true,
                slug: true,
                group: true,
                unit: true,
                valueType: true,
                isFilterable: true,
                isComparable: true,
              },
            },
            attributeValue: {
              select: {
                value: true,
                slug: true,
                numericValue: true,
                attribute: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    group: true,
                    unit: true,
                    valueType: true,
                    isFilterable: true,
                    isComparable: true,
                  },
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

    // SS-235 B1: earliest active-promotion end in scope → detail countdown.
    const detailPromotions = await this.pricing.activePromotionsFor({
      productId: product.id,
      categoryId: product.categoryId,
      brandId: product.brandId,
    });
    const promotionEndsAt =
      detailPromotions.length === 0
        ? null
        : new Date(
            Math.min(...detailPromotions.map((promo) => promo.endsAt.getTime())),
          ).toISOString();

    const variants: CatalogProductVariantDto[] = product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      price: roundRialUp(variant.price).toString(),
      compareAtPrice:
        roundedCompareAt(variant.price, variant.compareAtPrice)?.toString() ??
        null,
      priceStatus: variant.priceStatus,
      inStock: (availableByVariant.get(variant.id) ?? 0) > 0,
      options: variant.options
        .map((option) => ({
          attributeName: option.attributeValue.attribute.name,
          attributeSlug: option.attributeValue.attribute.slug,
          value: option.attributeValue.value,
          valueSlug: option.attributeValue.slug,
        }))
        .sort(
          (a, b) =>
            a.attributeName.localeCompare(b.attributeName) ||
            a.value.localeCompare(b.value),
        ),
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
      variantId: row.variantId,
    }));

    const specs: CatalogProductSpecDto[] = product.specs.map((row) => {
      const attribute = row.attributeValue?.attribute ?? row.attribute;
      const numeric = row.valueNumber ?? row.attributeValue?.numericValue ?? null;
      const value =
        row.attributeValue?.value ??
        row.valueText ??
        (numeric !== null
          ? `${numeric.toString()}${attribute.unit ? ` ${attribute.unit}` : ''}`
          : row.valueBoolean !== null
            ? row.valueBoolean
              ? 'بله'
              : 'خیر'
            : '');
      return {
        attributeId: attribute.id,
        attributeName: attribute.name,
        attributeSlug: attribute.slug,
        attributeGroup: attribute.group,
        value,
        valueSlug: row.attributeValue?.slug ?? '',
        sortOrder: row.sortOrder,
        valueType: attribute.valueType,
        unit: attribute.unit,
        isFilterable: attribute.isFilterable,
        isComparable: attribute.isComparable,
        numericValue: numeric?.toString() ?? null,
        booleanValue: row.valueBoolean,
      };
    });

    const tags: CatalogRefDto[] = product.tags.map((row) => row.tag);

    const related = await this.getRelatedCards({
      productId: product.id,
      categoryId: product.categoryId,
      brandId: product.brandId,
    });

    const { previous, next } = await this.getAdjacentProducts(product);

    // SS-236: approved-review aggregate for the detail stars + JSON-LD.
    const detailRating = (
      await this.ratingAggregatesByProduct([product.id])
    ).get(product.id) ?? { average: null, count: 0 };

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
      ratingAverage: detailRating.average,
      ratingCount: detailRating.count,
      promotionEndsAt,
      related,
      previous,
      next,
      createdAt: product.createdAt.toISOString(),
    };
  }

  /**
   * Public per-variant price quotes (SS-235 B1, pricing-engine.md §8
   * `GET /products/{slug}/price`). Guests and retail customers resolve at
   * retail (PRICE-002); an authenticated APPROVED partner resolves with
   * their tier (PRICE-003, `tierApplied`). Full B1 chain per line
   * (category rule → override → tier → bulk → promotion); CALL_FOR_PRICE
   * variants quote null prices — they are RFQ stand-ins, never purchasable
   * (PRICE-008). One lookup set per product, never per-variant N+1.
   */
  async getPriceBySlug(
    slug: string,
    userId: string | null,
    quantity: number,
  ): Promise<CatalogPriceResponseDto> {
    const product = await this.prisma.product.findFirst({
      where: { slug, deletedAt: null, status: ProductStatus.PUBLISHED },
      select: {
        id: true,
        slug: true,
        categoryId: true,
        brandId: true,
        variants: {
          where: { deletedAt: null },
          select: { id: true, sku: true, price: true, priceStatus: true },
          orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        },
      },
    });
    if (!product) {
      throw new NotFoundException('محصول یافت نشد.');
    }
    const scope = {
      productId: product.id,
      categoryId: product.categoryId,
      brandId: product.brandId,
    };
    const [promotions, categoryRule, override, tierPct] = await Promise.all([
      this.pricing.activePromotionsFor(scope),
      this.pricing.categoryRuleFor(scope.categoryId),
      this.pricing.productOverrideFor(scope.productId),
      userId
        ? this.pricing.tierDiscountForUser(userId)
        : Promise.resolve(new Prisma.Decimal(0)),
    ]);
    const promotionEndsAt =
      promotions.length === 0
        ? null
        : new Date(
            Math.min(...promotions.map((promo) => promo.endsAt.getTime())),
          ).toISOString();
    const quotes: CatalogPriceQuoteDto[] = product.variants.map((variant) => {
      if (variant.priceStatus !== PriceStatus.PRICED) {
        return {
          variantId: variant.id,
          sku: variant.sku,
          priceStatus: variant.priceStatus,
          basePrice: null,
          resolvedPrice: null,
          promotionEndsAt,
        };
      }
      const resolved = PricingService.resolveLine(
        variant.price,
        quantity,
        tierPct,
        promotions,
        { categoryRule, override },
      );
      return {
        variantId: variant.id,
        sku: variant.sku,
        priceStatus: variant.priceStatus,
        basePrice: roundRialUp(variant.price).toString(),
        resolvedPrice: resolved.toString(),
        promotionEndsAt,
      };
    });
    return {
      slug: product.slug,
      productId: product.id,
      quantity,
      tierApplied: tierPct.greaterThan(0),
      quotes,
    };
  }

  /**
   * Previous/next product navigation (SS-227): the nearest newer (previous)
   * and older (next) published products in the listing-default order
   * (newest first). Scoped to the leaf category first; the global catalog is
   * the fallback so single-product categories still navigate. Bounded: at
   * most four take-1 queries, never an unbounded scan.
   */
  private async getAdjacentProducts(product: {
    id: string;
    categoryId: string;
    createdAt: Date;
  }): Promise<{ previous: CatalogRefDto | null; next: CatalogRefDto | null }> {
    const neighbourSelect = { name: true, slug: true };
    const baseWhere: Prisma.ProductWhereInput = {
      deletedAt: null,
      status: ProductStatus.PUBLISHED,
      id: { not: product.id },
    };
    const createdAt = product.createdAt;

    const newerInCategory = () =>
      this.prisma.product.findFirst({
        where: {
          ...baseWhere,
          categoryId: product.categoryId,
          OR: [
            { createdAt: { gt: createdAt } },
            { createdAt: { equals: createdAt }, id: { gt: product.id } },
          ],
        },
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        select: neighbourSelect,
      });
    const olderInCategory = () =>
      this.prisma.product.findFirst({
        where: {
          ...baseWhere,
          categoryId: product.categoryId,
          OR: [
            { createdAt: { lt: createdAt } },
            { createdAt: { equals: createdAt }, id: { lt: product.id } },
          ],
        },
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        select: neighbourSelect,
      });
    const newerGlobal = () =>
      this.prisma.product.findFirst({
        where: {
          ...baseWhere,
          OR: [
            { createdAt: { gt: createdAt } },
            { createdAt: { equals: createdAt }, id: { gt: product.id } },
          ],
        },
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        select: neighbourSelect,
      });
    const olderGlobal = () =>
      this.prisma.product.findFirst({
        where: {
          ...baseWhere,
          OR: [
            { createdAt: { lt: createdAt } },
            { createdAt: { equals: createdAt }, id: { lt: product.id } },
          ],
        },
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        select: neighbourSelect,
      });

    const [previousInCategory, nextInCategory] = await Promise.all([
      newerInCategory(),
      olderInCategory(),
    ]);
    const [previous, next] =
      previousInCategory && nextInCategory
        ? [previousInCategory, nextInCategory]
        : await Promise.all([
            previousInCategory ?? newerGlobal(),
            nextInCategory ?? olderGlobal(),
          ]);

    return { previous: previous ?? null, next: next ?? null };
  }

  /**
   * Related-product rail (SS-214): deterministic, bounded, no recommendation
   * engine. Primary pool is the exact leaf category (never the subtree);
   * same-brand rows come first; when the leaf yields fewer than 4 rows and
   * the product is branded, same-brand rows from other categories backfill
   * up to RELATED_LIMIT. Current product excluded, published/non-deleted
   * only. Hydration reuses hydrateCards() so price/stock/media truth is
   * identical to listing cards; at most 3 bounded queries, never the catalog.
   */
  private async getRelatedCards(args: {
    productId: string;
    categoryId: string;
    brandId: string | null;
  }): Promise<CatalogProductCardDto[]> {
    const RELATED_LIMIT = 8;
    const BACKFILL_MINIMUM = 4;
    const visibility = {
      deletedAt: null,
      status: ProductStatus.PUBLISHED,
    } satisfies Prisma.ProductWhereInput;
    const newestFirst = [
      { createdAt: 'desc' as const },
      { id: 'desc' as const },
    ] as Prisma.ProductOrderByWithRelationInput[];

    const ids: string[] = [];

    if (args.brandId !== null) {
      const sameBrand = await this.prisma.product.findMany({
        where: {
          ...visibility,
          id: { not: args.productId },
          categoryId: args.categoryId,
          brandId: args.brandId,
        },
        select: { id: true },
        orderBy: newestFirst,
        take: RELATED_LIMIT,
      });
      ids.push(...sameBrand.map((row) => row.id));
    }

    if (ids.length < RELATED_LIMIT) {
      const others = await this.prisma.product.findMany({
        where: {
          ...visibility,
          id:
            ids.length > 0
              ? { not: args.productId, notIn: ids }
              : { not: args.productId },
          categoryId: args.categoryId,
        },
        select: { id: true },
        orderBy: newestFirst,
        take: RELATED_LIMIT - ids.length,
      });
      ids.push(...others.map((row) => row.id));
    }

    if (ids.length < BACKFILL_MINIMUM && args.brandId !== null) {
      const backfill = await this.prisma.product.findMany({
        where: {
          ...visibility,
          id: { not: args.productId, notIn: ids },
          categoryId: { not: args.categoryId },
          brandId: args.brandId,
        },
        select: { id: true },
        orderBy: newestFirst,
        take: RELATED_LIMIT - ids.length,
      });
      ids.push(...backfill.map((row) => row.id));
    }

    if (ids.length === 0) {
      return [];
    }
    return this.hydrateCards(ids);
  }

  /** Visibility + public filters shared by count and page queries. */
  // ---------------------------------------------------------------------
  // Category-aware facets / attribute filters / comparison (SS-900)
  // ---------------------------------------------------------------------

  /**
   * Facets are derived from the selected category's configured filterable
   * attributes (with parent inheritance). Counts only include published,
   * non-deleted products in the category subtree; brand options are scoped to
   * the same product set, never the global brand table.
   */
  async getFacets(categorySlug: string | null): Promise<CatalogFacetsResponse> {
    if (!categorySlug) {
      return { categorySlug: null, attributes: [], brands: [] };
    }
    const category = await this.prisma.category.findFirst({
      where: { slug: categorySlug, deletedAt: null, isVisible: true },
      select: { id: true },
    });
    if (!category) {
      return { categorySlug, attributes: [], brands: [] };
    }
    const subtreeIds = await this.categorySubtreeIds(categorySlug);
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        status: ProductStatus.PUBLISHED,
        categoryId: { in: subtreeIds },
      },
      select: { id: true, brandId: true },
    });
    const productIds = products.map((row) => row.id);
    const brandCounts = new Map<string, number>();
    for (const product of products) {
      if (product.brandId) {
        brandCounts.set(
          product.brandId,
          (brandCounts.get(product.brandId) ?? 0) + 1,
        );
      }
    }
    const brandRows =
      brandCounts.size > 0
        ? await this.prisma.brand.findMany({
            where: { id: { in: [...brandCounts.keys()] }, deletedAt: null },
            select: { id: true, name: true, slug: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
          })
        : [];
    const brands: CatalogBrandDto[] = brandRows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      productCount: brandCounts.get(row.id) ?? 0,
    }));

    const assignments = (
      await this.attributes.resolvedCategoryAttributes(category.id)
    ).filter((row) => row.isFilterable);
    if (assignments.length === 0 || productIds.length === 0) {
      return { categorySlug, attributes: [], brands };
    }
    const attributeIds = assignments.map((row) => row.attribute.id);
    const rows = await this.prisma.productAttributeValue.findMany({
      where: {
        productId: { in: productIds },
        attributeId: { in: attributeIds },
      },
      select: {
        productId: true,
        attributeId: true,
        valueNumber: true,
        valueBoolean: true,
        valueText: true,
        attributeValueId: true,
      },
    });
    const byAttribute = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byAttribute.get(row.attributeId) ?? [];
      list.push(row);
      byAttribute.set(row.attributeId, list);
    }
    const attributes = assignments.map((assignment) => {
      const attribute = assignment.attribute;
      const attrRows = byAttribute.get(attribute.id) ?? [];
      const optionCounts = new Map<string, Set<string>>();
      const numbers: number[] = [];
      for (const row of attrRows) {
        if (row.attributeValueId) {
          const set = optionCounts.get(row.attributeValueId) ?? new Set<string>();
          set.add(row.productId);
          optionCounts.set(row.attributeValueId, set);
        }
        if (row.valueNumber !== null) {
          const numeric = Number(row.valueNumber.toString());
          if (Number.isFinite(numeric)) {
            numbers.push(numeric);
          }
        }
      }
      return {
        attributeId: attribute.id,
        name: attribute.name,
        slug: attribute.slug,
        unit: attribute.unit,
        valueType: attribute.valueType,
        isComparable: assignment.isComparable,
        options: attribute.values
          .filter((option) => option.isActive)
          .map((option) => ({
            id: option.id,
            value: option.value,
            slug: option.slug,
            count: optionCounts.get(option.id)?.size ?? 0,
          }))
          .filter((option) => option.count > 0),
        numericMin: numbers.length > 0 ? Math.min(...numbers) : null,
        numericMax: numbers.length > 0 ? Math.max(...numbers) : null,
      };
    });
    return { categorySlug, attributes, brands };
  }

  /**
   * Category-aware comparison from the real catalog: only attributes
   * configured as comparable for every selected product's category (or, when
   * no category assignments exist, attributes marked comparable on the
   * definition) are returned. Missing values are null, never fabricated.
   */
  async compare(slugs: string[]): Promise<CatalogCompareResponse> {
    if (slugs.length === 0) {
      return { attributes: [], products: [], categories: [] };
    }
    if (slugs.length > 4) {
      throw new BadRequestException('حداکثر چهار محصول قابل مقایسه است.');
    }
    const rows = await this.prisma.product.findMany({
      where: {
        slug: { in: slugs },
        deletedAt: null,
        status: ProductStatus.PUBLISHED,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        category: { select: { id: true, name: true, slug: true } },
        specs: {
          select: {
            attributeId: true,
            valueText: true,
            valueNumber: true,
            valueBoolean: true,
            attributeValue: { select: { value: true } },
            attribute: {
              select: {
                id: true,
                name: true,
                slug: true,
                unit: true,
                valueType: true,
                isComparable: true,
              },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    const ordered = slugs
      .map((slug) => bySlug.get(slug))
      .filter((row): row is (typeof rows)[number] => Boolean(row));
    if (ordered.length === 0) {
      return { attributes: [], products: [], categories: [] };
    }

    const assignmentCache = new Map<string, Set<string>>();
    const comparableSets = await Promise.all(
      ordered.map(async (product) => {
        const cached = assignmentCache.get(product.category.id);
        if (cached) {
          return cached;
        }
        const assignments = await this.attributes.resolvedCategoryAttributes(
          product.category.id,
        );
        const assignmentIds = new Set(assignments.map((row) => row.attribute.id));
        const primary = new Set(
          assignments
            .filter((row) => row.isComparable)
            .map((row) => row.attribute.id),
        );
        const fallback = new Set(
          product.specs
            .filter(
              (spec) =>
                !assignmentIds.has(spec.attributeId) &&
                spec.attribute.isComparable,
            )
            .map((spec) => spec.attributeId),
        );
        const result = primary.size > 0 ? primary : fallback;
        assignmentCache.set(product.category.id, result);
        return result;
      }),
    );
    const commonIds = [...comparableSets[0]!].filter((id) =>
      comparableSets.every((set) => set.has(id)),
    );
    const categories = uniqueCategories(ordered);
    if (commonIds.length === 0) {
      return {
        attributes: [],
        products: ordered.map((product) => ({
          id: product.id,
          name: product.name,
          slug: product.slug,
          category: product.category,
          values: {},
        })),
        categories,
      };
    }
    const meta = new Map<
      string,
      (typeof ordered)[number]['specs'][number]['attribute']
    >();
    for (const product of ordered) {
      for (const spec of product.specs) {
        if (commonIds.includes(spec.attributeId) && !meta.has(spec.attributeId)) {
          meta.set(spec.attributeId, spec.attribute);
        }
      }
    }
    const attributes = commonIds.flatMap((id) => {
      const attribute = meta.get(id);
      return attribute
        ? [
            {
              attributeId: attribute.id,
              name: attribute.name,
              slug: attribute.slug,
              unit: attribute.unit,
              valueType: attribute.valueType,
              isComparable: true,
            },
          ]
        : [];
    });
    attributes.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    return {
      attributes,
      products: ordered.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        category: product.category,
        values: Object.fromEntries(
          commonIds.map((id) => [
            id,
            formatSpecValue(
              product.specs.filter((spec) => spec.attributeId === id),
              meta.get(id)?.unit ?? null,
            ),
          ]),
        ),
      })),
      categories,
    };
  }

  /**
   * Parses the compact `attrs` JSON and produces an AND-of-`some` predicate.
   * Only filterable attributes assigned to the selected category are honored;
   * unknown attributes are a 400 (never a silent no-op). Numeric filters use
   * valueNumber; booleans use valueBoolean; select filters match option slugs.
   */
  private async attributeFilterWhere(
    query: ListCatalogProductsQueryDto,
  ): Promise<Prisma.ProductWhereInput | null> {
    if (query.attrs === undefined || query.attrs.trim() === '') {
      return null;
    }
    if (!query.category) {
      throw new BadRequestException(
        'فیلتر ویژگی‌ها فقط همراه با انتخاب دسته‌بندی مجاز است.',
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(query.attrs);
    } catch {
      throw new BadRequestException('ساختار فیلتر ویژگی‌ها معتبر نیست.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException('ساختار فیلتر ویژگی‌ها معتبر نیست.');
    }
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) {
      return null;
    }
    if (entries.length > 20) {
      throw new BadRequestException('تعداد فیلترهای ویژگی بیش از حد مجاز است.');
    }
    const category = await this.prisma.category.findFirst({
      where: { slug: query.category, deletedAt: null, isVisible: true },
      select: { id: true },
    });
    if (!category) {
      return { id: { in: [] } };
    }
    const assignments = await this.attributes.resolvedCategoryAttributes(
      category.id,
    );
    const bySlug = new Map(
      assignments
        .filter((row) => row.isFilterable)
        .map((row) => [row.attribute.slug, row.attribute]),
    );
    const conditions: Prisma.ProductWhereInput[] = [];
    for (const [slug, rawValue] of entries) {
      const attribute = bySlug.get(slug);
      if (!attribute) {
        throw new BadRequestException(
          `ویژگی «${slug}» برای این دسته قابل فیلتر نیست.`,
        );
      }
      if (
        attribute.valueType === 'SELECT' ||
        attribute.valueType === 'MULTI_SELECT'
      ) {
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        if (
          values.length === 0 ||
          values.some(
            (value) => typeof value !== 'string' || value.length > 120,
          )
        ) {
          throw new BadRequestException('مقدار فیلتر ویژگی معتبر نیست.');
        }
        const allowed = new Set(
          attribute.values
            .filter((option) => option.isActive)
            .map((option) => option.slug),
        );
        const slugsToMatch = (values as string[]).filter((value) =>
          allowed.has(value),
        );
        conditions.push({
          specs: {
            some: {
              attributeId: attribute.id,
              attributeValue: { slug: { in: slugsToMatch } },
            },
          },
        });
        continue;
      }
      if (attribute.valueType === 'BOOLEAN') {
        if (typeof rawValue !== 'boolean') {
          throw new BadRequestException('مقدار فیلتر ویژگی معتبر نیست.');
        }
        conditions.push({
          specs: {
            some: { attributeId: attribute.id, valueBoolean: rawValue },
          },
        });
        continue;
      }
      if (attribute.valueType === 'NUMBER') {
        const range = parseNumericFilter(rawValue);
        if (range === null) {
          throw new BadRequestException('مقدار فیلتر عددی معتبر نیست.');
        }
        conditions.push({
          specs: {
            some: {
              attributeId: attribute.id,
              valueNumber: {
                ...(range.min !== null ? { gte: range.min } : {}),
                ...(range.max !== null ? { lte: range.max } : {}),
              },
            },
          },
        });
        continue;
      }
      if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
        throw new BadRequestException('مقدار فیلتر ویژگی معتبر نیست.');
      }
      conditions.push({
        specs: {
          some: { attributeId: attribute.id, valueText: rawValue.trim() },
        },
      });
    }
    return conditions.length > 0 ? { AND: conditions } : null;
  }

  private async productVisibilityWhere(
    query: ListCatalogProductsQueryDto,
  ): Promise<Prisma.ProductWhereInput> {
    const attributeWhere = await this.attributeFilterWhere(query);
    return {
      ...(await this.visibleProductWhere(query)),
      ...(attributeWhere ?? {}),
    };
  }

  /**
   * Product visibility without the price predicate (SS-213): the shared scope
   * for the listing, the price sort, and the in-stock variant prefilter, so a
   * price or stock filter can never narrow the category subtree or leak
   * hidden/unpublished products.
   */
  private async visibleProductWhere(
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
   * Product ids with at least one live PRICED variant whose customer-facing
   * rounded Rial price satisfies the range. The storefront displays
   * CEIL(price/100000)*100000, so filtering must use the same value.
   */
  private async roundedPriceProductIds(range: {
    from?: Prisma.Decimal;
    to?: Prisma.Decimal;
  }): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT DISTINCT pv."productId" AS "id"
      FROM "ProductVariant" pv
      JOIN "Product" p ON p."id" = pv."productId"
      WHERE pv."deletedAt" IS NULL
        AND pv."priceStatus" = 'PRICED'
        AND p."deletedAt" IS NULL
        AND p."status" = 'PUBLISHED'
        ${range.from !== undefined ? Prisma.sql`AND CEIL(pv."price" / 100000) * 100000 >= ${range.from.toString()}::numeric` : Prisma.empty}
        ${range.to !== undefined ? Prisma.sql`AND CEIL(pv."price" / 100000) * 100000 <= ${range.to.toString()}::numeric` : Prisma.empty}
    `);
    return rows.map((row) => row.id);
  }

  /** Variant ids satisfying the same customer-facing rounded range. */
  private async roundedPriceVariantIds(range: {
    from?: Prisma.Decimal;
    to?: Prisma.Decimal;
  }): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT pv."id" AS "id"
      FROM "ProductVariant" pv
      WHERE pv."deletedAt" IS NULL
        AND pv."priceStatus" = 'PRICED'
        ${range.from !== undefined ? Prisma.sql`AND CEIL(pv."price" / 100000) * 100000 >= ${range.from.toString()}::numeric` : Prisma.empty}
        ${range.to !== undefined ? Prisma.sql`AND CEIL(pv."price" / 100000) * 100000 <= ${range.to.toString()}::numeric` : Prisma.empty}
    `);
    return rows.map((row) => row.id);
  }

  /**
   * Product ids with at least one genuinely available variant (SS-213).
   *
   * Prisma cannot express `quantityOnHand − quantityReserved > 0` as a column
   * comparison, so candidates are prefetched and availability is derived with
   * the existing `deriveAvailable()` under `activeInventoryWhere()` — the same
   * helpers as every other inventory read. Fully-reserved stock
   * (`onHand == reserved`) is therefore excluded. An empty result matches
   * nothing (same convention as unknown category slugs).
   *
   * The variant prefilter mirrors the listing visibility scope, and when a
   * price range is present the SAME variant must satisfy both the range and
   * availability (a cheap out-of-stock variant cannot qualify its product).
   */
  private async inStockProductIds(
    query: ListCatalogProductsQueryDto,
  ): Promise<string[]> {
    const range = normalizedPriceRange(query);
    const pricedVariantIds =
      range.from !== undefined || range.to !== undefined
        ? new Set(await this.roundedPriceVariantIds(range))
        : null;
    if (pricedVariantIds !== null && pricedVariantIds.size === 0) {
      return [];
    }
    const candidates = await this.prisma.productVariant.findMany({
      where: {
        deletedAt: null,
        ...(pricedVariantIds !== null
          ? { id: { in: [...pricedVariantIds] } }
          : {}),
        product: { is: await this.visibleProductWhere(query) },
      },
      select: { id: true, productId: true },
    });
    if (candidates.length === 0) {
      return [];
    }
    const availableByVariant = await this.availableByVariant(
      candidates.map((variant) => variant.id),
    );
    const productIds = new Set<string>();
    for (const variant of candidates) {
      if ((availableByVariant.get(variant.id) ?? 0) > 0) {
        productIds.add(variant.productId);
      }
    }
    return [...productIds];
  }

  /**
   * Product ids whose APPROVED-review average falls in a star bucket
   * (SS-236, exact ranges — see RATING_BUCKET_RANGES). One groupBy over
   * approved rows (one row per reviewed product, bounded by the catalog),
   * filtered in JS; Prisma has no HAVING on `_avg` in this shape. An empty
   * result matches nothing (same convention as unknown category slugs).
   * Unreviewed products never match a bucket.
   */
  private async ratingProductIds(bucket: string): Promise<string[]> {
    const range = RATING_BUCKET_RANGES[bucket];
    if (!range) {
      return [];
    }
    const groups = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { status: ReviewStatus.APPROVED },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return groups
      .filter(
        (group) =>
          group._avg.rating !== null &&
          Number(group._avg.rating) >= range.min &&
          (range.max === undefined || Number(group._avg.rating) < range.max),
      )
      .map((group) => group.productId);
  }

  /**
   * APPROVED-review aggregates per product (SS-236): average rounded to 1
   * decimal via the shared `roundRatingAverage`, plus the count. Products
   * without approved reviews resolve to `{ average: null, count: 0 }` so
   * callers render no stars instead of a fabricated zero. One batched
   * groupBy per call site (cards page, single detail), never N+1.
   */
  private async ratingAggregatesByProduct(
    productIds: string[],
  ): Promise<Map<string, { average: number | null; count: number }>> {
    const aggregates = new Map<string, { average: number | null; count: number }>();
    if (productIds.length === 0) {
      return aggregates;
    }
    const groups = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, status: ReviewStatus.APPROVED },
      _avg: { rating: true },
      _count: { _all: true },
    });
    for (const group of groups) {
      aggregates.set(group.productId, {
        average:
          group._avg.rating === null
            ? null
            : roundRatingAverage(group._avg.rating),
        count: group._count._all,
      });
    }
    return aggregates;
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

  /**
   * Listing cards for an explicit id list, restricted to publicly visible
   * products (PUBLISHED, non-deleted). Order follows the input ids; invisible
   * ids are skipped silently. Shared hydration pipeline with the listing, so
   * wishlist rows (SS-231) carry identical price/stock/media truth.
   */
  async getVisibleCardsByIds(
    productIds: string[],
  ): Promise<CatalogProductCardDto[]> {
    if (productIds.length === 0) {
      return [];
    }
    const visible = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        deletedAt: null,
        status: ProductStatus.PUBLISHED,
      },
      select: { id: true },
    });
    const visibleIds = new Set(visible.map((row) => row.id));
    const orderedIds = productIds.filter((id) => visibleIds.has(id));
    if (orderedIds.length === 0) {
      return [];
    }
    return this.hydrateCards(orderedIds);
  }

  /** Builds the listing cards for an already-paginated, ordered id list. */
  private async hydrateCards(
    pageIds: string[],
  ): Promise<CatalogProductCardDto[]> {
    // SS-217: minPrice comes from the denormalized Product column — the same
    // single source of truth as the price sorts and the search SQL.
    const rows = await this.prisma.product.findMany({
      where: { id: { in: pageIds } },
      select: {
        id: true,
        name: true,
        slug: true,
        condition: true,
        minPrice: true,
        categoryId: true,
        brandId: true,
        brand: { select: { name: true, slug: true } },
        category: { select: { name: true, slug: true } },
        variants: {
          where: { deletedAt: null },
          select: {
            id: true,
            price: true,
            compareAtPrice: true,
            priceStatus: true,
          },
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
    });

    // Collect every live variant of the page once for the availability map.
    const variantIds = rows.flatMap((row) => row.variants.map((v) => v.id));
    const availableByVariant = await this.availableByVariant(variantIds);
    // SS-235 B1: one batched promotion lookup drives every card countdown.
    const promotionEndsAtByProduct = await this.pricing.promotionEndsAtByProduct(
      rows.map((row) => ({
        productId: row.id,
        categoryId: row.categoryId,
        brandId: row.brandId,
      })),
    );
    // SS-236: one batched review-aggregate lookup drives every card's stars.
    const ratingsByProduct = await this.ratingAggregatesByProduct(
      rows.map((row) => row.id),
    );

    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const cards: CatalogProductCardDto[] = [];
    for (const id of pageIds) {
      const row = rowsById.get(id);
      if (!row) {
        continue;
      }
      const minPrice = row.minPrice;
      const priceFrom =
        minPrice == null ? null : roundRialUp(minPrice).toString();
      const rating = ratingsByProduct.get(row.id) ?? { average: null, count: 0 };
      cards.push({
        id: row.id,
        name: row.name,
        slug: row.slug,
        condition: row.condition,
        brand: row.brand,
        category: row.category,
        priceFrom: priceFrom ?? '',
        compareAtPrice: pickCardCompareAtPrice(row.variants, priceFrom),
        callForPrice: minPrice == null,
        promotionEndsAt: promotionEndsAtByProduct.get(row.id) ?? null,
        variantCount: row.variants.length,
        inStock: row.variants.some(
          (variant) => (availableByVariant.get(variant.id) ?? 0) > 0,
        ),
        ratingAverage: rating.average,
        ratingCount: rating.count,
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

function decimalToString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : String(value);
}

/**
 * Exact star-bucket ranges over the APPROVED-review average (SS-236):
 * bucket N owns [N−0.5, N+0.5), with 5 open at the top (avg ≤ 5 always)
 * and 1 open at the bottom. The DTO whitelist guarantees the key exists;
 * an unknown key matches nothing (defensive, mirrors unknown slugs).
 */
const RATING_BUCKET_RANGES: Record<string, { min: number; max?: number }> = {
  '5': { min: 4.5 },
  '4': { min: 3.5, max: 4.5 },
  '3': { min: 2.5, max: 3.5 },
  '2': { min: 1.5, max: 2.5 },
  '1': { min: 0, max: 1.5 },
};

/**
 * The compareAtPrice shown on a listing card (SS-225): that of the
 * minimum-priced PRICED variant — the same variant whose price becomes
 * `priceFrom` via the denormalized minPrice. Ties resolve to the first
 * variant in the load order, mirroring the card's price semantics. Null
 * when the product is call-for-price or the winning variant has no
 * reference price, so a discount badge can never invent a discount.
 */
export function pickCardCompareAtPrice(
  variants: ReadonlyArray<{
    price?: Prisma.Decimal | string;
    compareAtPrice: Prisma.Decimal | string | null;
    priceStatus: string;
  }>,
  priceFrom: string | null | undefined,
): string | null {
  // `priceFrom` comes from the denormalized column; defensive over `undefined`
  // keeps partial test projections harmless.
  if (priceFrom === null || priceFrom === undefined) {
    return null;
  }
  const min = new Prisma.Decimal(priceFrom);
  let winner: string | null = null;
  for (const variant of variants) {
    if (variant.priceStatus !== 'PRICED' || variant.price === undefined) {
      continue;
    }
    // Cards display the rounded price. Match the variant against the same
    // rounded value, not its raw stored price, otherwise a price such as
    // 7,650,000 (displayed 7,700,000) never finds its compare-at row.
    if (roundRialUp(variant.price).comparedTo(min) !== 0) {
      continue;
    }
    winner =
      variant.compareAtPrice === null
        ? null
        : String(variant.compareAtPrice);
    break;
  }
  if (winner === null) {
    return null;
  }
  // SS-900: both sides are rounded UP before deciding whether a discount is
  // real; a pair made equal by rounding never yields a misleading badge.
  const roundedWinner = roundedCompareAt(
    new Prisma.Decimal(priceFrom),
    new Prisma.Decimal(winner),
  );
  return roundedWinner?.toString() ?? null;
}

/**
 * Normalizes the SS-213 price bounds to Decimals. An inverted range is
 * normalized by swapping — the same single policy as the storefront
 * `parseListingState`, so frontend and API never validate ranges twice under
 * different rules. The DTO guarantees the numeric format; this only orders.
 */
function normalizedPriceRange(query: {
  priceFrom?: string;
  priceTo?: string;
}): { from?: Prisma.Decimal; to?: Prisma.Decimal } {
  let from =
    query.priceFrom !== undefined
      ? new Prisma.Decimal(query.priceFrom)
      : undefined;
  let to =
    query.priceTo !== undefined ? new Prisma.Decimal(query.priceTo) : undefined;
  if (from !== undefined && to !== undefined && from.comparedTo(to) > 0) {
    [from, to] = [to, from];
  }
  return { from, to };
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

/** Unique category refs in the order products were supplied. */
function uniqueCategories(
  products: Array<{ category: { id: string; name: string; slug: string } }>,
): Array<{ id: string; name: string; slug: string }> {
  const seen = new Set<string>();
  const result: Array<{ id: string; name: string; slug: string }> = [];
  for (const product of products) {
    if (!seen.has(product.category.id)) {
      seen.add(product.category.id);
      result.push(product.category);
    }
  }
  return result;
}

/** Display value for one attribute across the (possibly multi-row) specs. */
function formatSpecValue(
  specs: Array<{
    valueText: string | null;
    valueNumber: Prisma.Decimal | null;
    valueBoolean: boolean | null;
    attributeValue: { value: string } | null;
  }>,
  unit: string | null,
): string | null {
  if (specs.length === 0) {
    return null;
  }
  const optionValues = specs
    .map((spec) => spec.attributeValue?.value)
    .filter((value): value is string => typeof value === 'string');
  if (optionValues.length > 0) {
    return [...new Set(optionValues)].join('، ');
  }
  const first = specs[0]!;
  if (first.valueNumber !== null) {
    const value = first.valueNumber.toString();
    return unit ? `${value} ${unit}` : value;
  }
  if (first.valueBoolean !== null) {
    return first.valueBoolean ? 'بله' : 'خیر';
  }
  return first.valueText;
}

/** Numeric filter accepts {min,max} or an exact number/string. */
function parseNumericFilter(
  raw: unknown,
): { min: number | null; max: number | null } | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { min: raw, max: raw } : null;
  }
  if (typeof raw === 'string') {
    if (raw.trim() === '') {
      return null;
    }
    const exact = Number(raw);
    return Number.isFinite(exact) ? { min: exact, max: exact } : null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const value = raw as { min?: unknown; max?: unknown };
  let min: number | null = null;
  let max: number | null = null;
  if (value.min !== undefined) {
    if (value.min === null || value.min === '') {
      return null;
    }
    const parsed = Number(value.min);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    min = parsed;
  }
  if (value.max !== undefined) {
    if (value.max === null || value.max === '') {
      return null;
    }
    const parsed = Number(value.max);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    max = parsed;
  }
  if (min === null && max === null) {
    return null;
  }
  if (min !== null && max !== null && min > max) {
    [min, max] = [max, min];
  }
  return { min, max };
}
