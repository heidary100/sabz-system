import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

/**
 * Read-only reference snapshot for dry-run resolution (SS-206).
 *
 * Loaded once per run; resolvers match against it without further queries.
 * The dry-run never writes — this loader only reads.
 */

/** Well-known external system for WooCommerce rows (matches SS-207 writer). */
export const WOO_SOURCE_SYSTEM = 'WOOCOMMERCE';

export interface ReferenceCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface ReferenceBrand {
  id: string;
  name: string;
  slug: string;
}

export interface WooReferenceData {
  categories: ReferenceCategory[];
  brands: ReferenceBrand[];
  /** Existing product slugs (collision preview). */
  productSlugs: Set<string>;
  /** Existing variant SKUs (collision preview). */
  variantSkus: Set<string>;
  /** Existing `WOOCOMMERCE:<sourceId>` identities (CREATE vs UPDATE). */
  sourceKeys: Set<string>;
  /** Existing variant SKU → sourceKey (variation parent lookup). */
  variantSkuToSourceKey: Map<string, string>;
}

@Injectable()
export class WooReferenceLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(): Promise<WooReferenceData> {
    const [categories, brands, products, variants, sourcedProducts, sourcedVariants] =
      await Promise.all([
        this.prisma.category.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true, slug: true, parentId: true },
        }),
        this.prisma.brand.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true, slug: true },
        }),
        this.prisma.product.findMany({
          where: { deletedAt: null },
          select: { slug: true },
        }),
        this.prisma.productVariant.findMany({
          where: { deletedAt: null },
          select: { sku: true },
        }),
        this.prisma.product.findMany({
          where: {
            deletedAt: null,
            sourceSystem: WOO_SOURCE_SYSTEM,
            sourceId: { not: null },
          },
          select: { sourceId: true },
        }),
        this.prisma.productVariant.findMany({
          where: {
            deletedAt: null,
            sourceSystem: WOO_SOURCE_SYSTEM,
            sourceId: { not: null },
          },
          select: { sku: true, sourceId: true },
        }),
      ]);

    const sourceKeys = new Set<string>();
    for (const row of sourcedProducts) {
      if (row.sourceId) {
        sourceKeys.add(`${WOO_SOURCE_SYSTEM}:${row.sourceId}`);
      }
    }
    const variantSkuToSourceKey = new Map<string, string>();
    for (const row of sourcedVariants) {
      if (row.sourceId) {
        sourceKeys.add(`${WOO_SOURCE_SYSTEM}:${row.sourceId}`);
        variantSkuToSourceKey.set(row.sku, `${WOO_SOURCE_SYSTEM}:${row.sourceId}`);
      }
    }
    return {
      categories,
      brands,
      productSlugs: new Set(products.map((row) => row.slug)),
      variantSkus: new Set(variants.map((row) => row.sku)),
      sourceKeys,
      variantSkuToSourceKey,
    };
  }
}
