import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import type {
  RemoveWishlistResponse,
  WishlistItemDto,
  WishlistListResponse,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { PublicCatalogService } from '../products/public-catalog.service';

/**
 * Customer wishlist (SS-231): per-user saved products.
 *
 * Listing truth (price/stock/media) comes from the shared public-catalog
 * card pipeline (`getVisibleCardsByIds`), so wishlist rows can never drift
 * from listing cards. Only PUBLISHED, non-deleted products are listable or
 * addable; stale rows (archived/deleted after saving) are skipped on read
 * and vanish entirely via the FK cascades.
 */
@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: PublicCatalogService,
  ) {}

  async list(userId: string): Promise<WishlistListResponse> {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { userId },
      select: { productId: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' as const }, { productId: 'asc' as const }],
    });
    if (rows.length === 0) {
      return { items: [], total: 0 };
    }
    const addedAtByProductId = new Map(
      rows.map((row) => [row.productId, row.createdAt.toISOString()]),
    );
    const cards = await this.catalog.getVisibleCardsByIds(
      rows.map((row) => row.productId),
    );
    const items: WishlistItemDto[] = cards.map((card) => ({
      ...card,
      // getVisibleCardsByIds only returns ids it was given, so the timestamp
      // lookup cannot miss.
      addedAt: addedAtByProductId.get(card.id)!,
    }));
    return { items, total: items.length };
  }

  async add(
    userId: string,
    productId: string,
  ): Promise<{ item: WishlistItemDto; created: boolean }> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, status: ProductStatus.PUBLISHED },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('محصول یافت نشد.');
    }

    const existing = await this.prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
      select: { createdAt: true },
    });
    if (existing) {
      return {
        item: await this.hydrateSingle(productId, existing.createdAt),
        created: false,
      };
    }

    try {
      const created = await this.prisma.wishlistItem.create({
        data: { userId, productId },
        select: { createdAt: true },
      });
      return {
        item: await this.hydrateSingle(productId, created.createdAt),
        created: true,
      };
    } catch {
      // Lost a concurrent-insert race (unique [userId, productId]): the row
      // exists now, so return it as a non-create instead of a 500.
      const raced = await this.prisma.wishlistItem.findUniqueOrThrow({
        where: { userId_productId: { userId, productId } },
        select: { createdAt: true },
      });
      return {
        item: await this.hydrateSingle(productId, raced.createdAt),
        created: false,
      };
    }
  }

  async remove(
    userId: string,
    productId: string,
  ): Promise<RemoveWishlistResponse> {
    const deleted = await this.prisma.wishlistItem.deleteMany({
      where: { userId, productId },
    });
    return { removed: deleted.count > 0 };
  }

  private async hydrateSingle(
    productId: string,
    createdAt: Date,
  ): Promise<WishlistItemDto> {
    const cards = await this.catalog.getVisibleCardsByIds([productId]);
    const card = cards[0];
    if (!card) {
      // Re-checked visibility inside add(); unreachable unless the product
      // was unpublished between the two queries.
      throw new NotFoundException('محصول یافت نشد.');
    }
    return { ...card, addedAt: createdAt.toISOString() };
  }
}
