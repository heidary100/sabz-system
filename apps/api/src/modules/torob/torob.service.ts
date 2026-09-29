import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PriceStatus, ProductMediaType, ProductStatus, Prisma } from '@prisma/client';
import type {
  TorobProductDto,
  TorobProductsRequest,
  TorobProductsResponse,
  TorobSort,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import {
  activeInventoryWhere,
  deriveAvailable,
} from '../inventory/inventory-aggregate';
import { PUBLIC_MEDIA_URL_PREFIX } from '../products/public-catalog.service';

/**
 * Torob product feed (SS-239, master plan §5.11, feed v3).
 *
 * Pure projection of the published catalog — no new storage. The visibility
 * predicate mirrors PublicCatalogService (PUBLISHED, non-soft-deleted);
 * feed rows exist only for PRICED variants (CALL_FOR_PRICE rows are RFQ
 * stand-ins, never a price, PRICE-008); availability comes exclusively from
 * the inventory read aggregate under `activeInventoryWhere()` (SS-112);
 * money leaves the service as Toman integers (Rial-verbatim storage ÷10,
 * SS-222) because Torob's unit is Toman. All URLs are absolute: page_url
 * points at the storefront product page, image_links at this API's public
 * media endpoint (storage keys are never exposed).
 *
 * Pagination is product-grained: one feed row per PRICED variant, but a
 * page is a slice of products (all their variant rows are returned at once)
 * so totals stay stable while variants are added/removed mid-sync.
 */
const PAGE_LIMIT = 100;
const CURSOR_VERSION = 1;

interface FeedProductRow {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  shortDescription: string | null;
  warranty: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: { name: string };
  variants: {
    id: string;
    price: Prisma.Decimal;
    compareAtPrice: Prisma.Decimal | null;
  }[];
  media: {
    id: string;
    isPrimary: boolean;
    sortOrder: number;
    mediaType: ProductMediaType;
  }[];
  specs: {
    attributeValue: { value: string; attribute: { name: string } };
  }[];
}

/** Extracts the product slug from an absolute storefront page URL. */
export function slugFromPageUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/products\/([^/]+)\/?$/);
    if (!match || match[1] === undefined) {
      return null;
    }
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Rial-verbatim storage → Toman integers (floor ÷10, SS-222). */
function rialToToman(price: Prisma.Decimal): number {
  return Math.floor(price.toNumber() / 10);
}

function sortField(sort: TorobSort): 'createdAt' | 'updatedAt' | 'id' {
  switch (sort) {
    case 'date_added_desc':
      return 'createdAt';
    case 'date_updated_desc':
      return 'updatedAt';
    case 'product_id_desc':
      return 'id';
  }
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

@Injectable()
export class TorobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getProducts(
    request: TorobProductsRequest,
  ): Promise<TorobProductsResponse> {
    if ('page_urls' in request) {
      return this.byPageUrls(request.page_urls.map(slugFromPageUrl));
    }
    if ('page_uniques' in request) {
      return this.byPageUniques(request.page_uniques);
    }
    if ('page' in request) {
      return this.byPage(request.page, request.sort);
    }
    return this.byCursor(request.cursor, request.sort);
  }

  private storefrontBase(): string {
    return trimTrailingSlash(
      this.configService.get<string>(
        'TOROB_FEED_STOREFRONT_BASE_URL',
        'http://localhost:3002',
      ),
    );
  }

  private apiBase(): string {
    return trimTrailingSlash(
      this.configService.get<string>(
        'TOROB_FEED_API_BASE_URL',
        'http://localhost:3000',
      ),
    );
  }

  private visibilityWhere(): Prisma.ProductWhereInput {
    return {
      deletedAt: null,
      status: ProductStatus.PUBLISHED,
      // Feed rows are priced offers only: a product whose every variant is
      // CALL_FOR_PRICE has nothing to advertise on Torob.
      variants: {
        some: { deletedAt: null, priceStatus: PriceStatus.PRICED },
      },
    };
  }

  private feedSelect(): Prisma.ProductSelect {
    return {
      id: true,
      name: true,
      slug: true,
      subtitle: true,
      shortDescription: true,
      warranty: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { name: true } },
      variants: {
        where: { deletedAt: null, priceStatus: PriceStatus.PRICED },
        select: { id: true, price: true, compareAtPrice: true },
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      },
      media: {
        select: {
          id: true,
          isPrimary: true,
          sortOrder: true,
          mediaType: true,
        },
      },
      specs: {
        select: {
          attributeValue: {
            select: { value: true, attribute: { select: { name: true } } },
          },
        },
        orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
      },
    };
  }

  private async byPage(
    page: number,
    sort: TorobSort,
  ): Promise<TorobProductsResponse> {
    const field = sortField(sort);
    const where = this.visibilityWhere();
    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        select: this.feedSelect(),
        orderBy: [{ [field]: 'desc' as const }, { id: 'desc' as const }],
        skip: (page - 1) * PAGE_LIMIT,
        take: PAGE_LIMIT,
      }),
    ]);
    return {
      api_version: 'torob_api_v3',
      current_page: page,
      total,
      max_pages: Math.max(1, Math.ceil(total / PAGE_LIMIT)),
      next_cursor: null,
      products: await this.toFeedRows(products as unknown as FeedProductRow[]),
    };
  }

  private async byCursor(
    cursor: string,
    sort: TorobSort,
  ): Promise<TorobProductsResponse> {
    const field = sortField(sort);
    const after = this.decodeCursor(cursor);
    const products = await this.prisma.product.findMany({
      where: { AND: [this.visibilityWhere(), this.cursorPredicate(field, after)] },
      select: this.feedSelect(),
      orderBy: [{ [field]: 'desc' as const }, { id: 'desc' as const }],
      take: PAGE_LIMIT + 1,
    });
    const hasMore = products.length > PAGE_LIMIT;
    const page = (hasMore ? products.slice(0, PAGE_LIMIT) : products) as unknown as FeedProductRow[];
    const last = hasMore ? page[page.length - 1] : undefined;
    return {
      api_version: 'torob_api_v3',
      current_page: 1,
      total: null,
      max_pages: null,
      next_cursor: hasMore && last ? this.encodeCursor(field, last) : null,
      products: await this.toFeedRows(page),
    };
  }

  /**
   * Cursor = (sort key, id) of the last emitted product, base64url of a
   * versioned JSON envelope. Invalid cursors decode to null and the feed
   * restarts from the top rather than erroring — a stale cursor after a
   * re-sort should degrade to a fresh sweep, not fail the sync.
   */
  private cursorPredicate(
    field: 'createdAt' | 'updatedAt' | 'id',
    after: { k: string; i: string } | null,
  ): Prisma.ProductWhereInput {
    if (!after) {
      return {};
    }
    if (field === 'id') {
      return { id: { lt: after.i } };
    }
    const key = new Date(after.k);
    if (Number.isNaN(key.getTime())) {
      return {};
    }
    return {
      OR: [
        { [field]: { lt: key } },
        { [field]: key, id: { lt: after.i } },
      ],
    };
  }

  private decodeCursor(cursor: string): { k: string; i: string } | null {
    try {
      const json = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (
        typeof json !== 'object' ||
        json === null ||
        json.v !== CURSOR_VERSION ||
        typeof json.k !== 'string' ||
        typeof json.i !== 'string'
      ) {
        return null;
      }
      return { k: json.k, i: json.i };
    } catch {
      return null;
    }
  }

  private encodeCursor(
    field: 'createdAt' | 'updatedAt' | 'id',
    product: FeedProductRow,
  ): string {
    const key = field === 'id' ? product.id : product[field].toISOString();
    return Buffer.from(
      JSON.stringify({ v: CURSOR_VERSION, k: key, i: product.id }),
    ).toString('base64url');
  }

  private async byPageUrls(
    slugs: (string | null)[],
  ): Promise<TorobProductsResponse> {
    // Unparseable/foreign URLs resolve to nothing: Torob syncs the URLs it
    // received from this feed, so an unmatchable one is a stale page, not a
    // client error.
    const resolved = slugs.filter((slug): slug is string => slug !== null);
    return this.bySlugs(resolved);
  }

  private async byPageUniques(uniques: string[]): Promise<TorobProductsResponse> {
    return this.bySlugs(uniques);
  }

  /** page_unique is the product slug — the same value page_url ends with. */
  private async bySlugs(slugs: string[]): Promise<TorobProductsResponse> {
    if (slugs.length === 0) {
      return this.emptyLookupResponse();
    }
    const products = (await this.prisma.product.findMany({
      where: { AND: [this.visibilityWhere(), { slug: { in: slugs } }] },
      select: this.feedSelect(),
      orderBy: [{ id: 'desc' as const }],
    })) as unknown as FeedProductRow[];
    return {
      api_version: 'torob_api_v3',
      current_page: 1,
      total: products.length,
      max_pages: null,
      next_cursor: null,
      products: await this.toFeedRows(products),
    };
  }

  private emptyLookupResponse(): TorobProductsResponse {
    return {
      api_version: 'torob_api_v3',
      current_page: 1,
      total: 0,
      max_pages: null,
      next_cursor: null,
      products: [],
    };
  }

  private async toFeedRows(products: FeedProductRow[]): Promise<TorobProductDto[]> {
    const variantIds = products.flatMap((product) =>
      product.variants.map((variant) => variant.id),
    );
    const availableByVariant = await this.availableByVariant(variantIds);
    const apiBase = this.apiBase();
    const storefrontBase = this.storefrontBase();

    const rows: TorobProductDto[] = [];
    for (const product of products) {
      const images = product.media
        .filter((item) => item.mediaType === ProductMediaType.IMAGE)
        .sort(
          (a, b) =>
            Number(b.isPrimary) - Number(a.isPrimary) ||
            a.sortOrder - b.sortOrder,
        )
        .map((item) => `${apiBase}${PUBLIC_MEDIA_URL_PREFIX}/${item.id}`);

      const spec: Record<string, string | number> = {};
      for (const row of product.specs) {
        const name = row.attributeValue.attribute.name;
        if (!(name in spec)) {
          spec[name] = row.attributeValue.value;
        }
      }

      for (const variant of product.variants) {
        const currentPrice = rialToToman(variant.price);
        const row: TorobProductDto = {
          page_unique: product.slug,
          page_url: `${storefrontBase}/products/${product.slug}`,
          product_group_id: product.id,
          title: product.name,
          current_price: currentPrice,
          availability: (availableByVariant.get(variant.id) ?? 0) > 0,
          category_name: product.category.name,
          image_links: images,
          spec,
          date_added: product.createdAt.toISOString(),
        };
        if (product.subtitle !== null) {
          row.subtitle = product.subtitle;
        }
        const compareAt = variant.compareAtPrice;
        if (compareAt !== null && compareAt.toNumber() > variant.price.toNumber()) {
          row.old_price = rialToToman(compareAt);
        }
        if (product.shortDescription !== null) {
          row.short_desc = product.shortDescription;
        }
        if (product.warranty !== null) {
          row.guarantee = product.warranty;
        }
        if (product.updatedAt.getTime() !== product.createdAt.getTime()) {
          row.date_updated = product.updatedAt.toISOString();
        }
        rows.push(row);
      }
    }
    return rows;
  }

  /** Same derivation as PublicCatalogService (on-hand − reserved, batched). */
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
}
