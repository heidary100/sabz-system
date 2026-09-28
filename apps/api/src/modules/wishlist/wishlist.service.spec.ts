import { NotFoundException } from '@nestjs/common';
import type { CatalogProductCardDto } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { PublicCatalogService } from '../products/public-catalog.service';
import { WishlistService } from './wishlist.service';

const USER_ID = 'user-1';
const PRODUCT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function makeCard(overrides: Partial<CatalogProductCardDto> = {}): CatalogProductCardDto {
  return {
    id: PRODUCT_ID,
    name: 'گوشی موبایل',
    slug: 'phone-1',
    condition: 'NEW',
    brand: null,
    category: { name: 'کالای دیجیتال', slug: 'digital' },
    priceFrom: '1000',
    compareAtPrice: null,
    callForPrice: false,
    promotionEndsAt: null,
    variantCount: 1,
    inStock: true,
    primaryImageUrl: null,
    primaryThumbnailUrl: null,
    ...overrides,
  };
}

describe('WishlistService', () => {
  let service: WishlistService;
  let prisma: {
    product: { findFirst: jest.Mock };
    wishlistItem: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let catalog: { getVisibleCardsByIds: jest.Mock };

  beforeEach(() => {
    prisma = {
      product: { findFirst: jest.fn() },
      wishlistItem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    catalog = { getVisibleCardsByIds: jest.fn() };
    service = new WishlistService(
      prisma as unknown as PrismaService,
      catalog as unknown as PublicCatalogService,
    );
  });

  describe('list', () => {
    it('returns an empty list without touching the catalog', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([]);

      await expect(service.list(USER_ID)).resolves.toEqual({
        items: [],
        total: 0,
      });
      expect(catalog.getVisibleCardsByIds).not.toHaveBeenCalled();
    });

    it('attaches addedAt to each visible card, newest first', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([
        { productId: 'p-new', createdAt: new Date('2026-09-02T00:00:00.000Z') },
        { productId: 'p-old', createdAt: new Date('2026-09-01T00:00:00.000Z') },
      ]);
      catalog.getVisibleCardsByIds.mockResolvedValue([
        makeCard({ id: 'p-new' }),
        makeCard({ id: 'p-old' }),
      ]);

      const result = await service.list(USER_ID);

      expect(catalog.getVisibleCardsByIds).toHaveBeenCalledWith([
        'p-new',
        'p-old',
      ]);
      expect(result).toEqual({
        items: [
          { ...makeCard({ id: 'p-new' }), addedAt: '2026-09-02T00:00:00.000Z' },
          { ...makeCard({ id: 'p-old' }), addedAt: '2026-09-01T00:00:00.000Z' },
        ],
        total: 2,
      });
    });

    it('skips rows whose product is no longer visible', async () => {
      prisma.wishlistItem.findMany.mockResolvedValue([
        { productId: 'p-gone', createdAt: new Date('2026-09-02T00:00:00.000Z') },
        { productId: 'p-live', createdAt: new Date('2026-09-01T00:00:00.000Z') },
      ]);
      catalog.getVisibleCardsByIds.mockResolvedValue([
        makeCard({ id: 'p-live' }),
      ]);

      const result = await service.list(USER_ID);

      expect(result.total).toBe(1);
      expect(result.items[0]!.id).toBe('p-live');
    });
  });

  describe('add', () => {
    it('creates the row and returns the hydrated card with 201 semantics', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
      prisma.wishlistItem.findUnique.mockResolvedValue(null);
      prisma.wishlistItem.create.mockResolvedValue({
        createdAt: new Date('2026-09-03T00:00:00.000Z'),
      });
      catalog.getVisibleCardsByIds.mockResolvedValue([makeCard()]);

      const result = await service.add(USER_ID, PRODUCT_ID);

      expect(result.created).toBe(true);
      expect(result.item).toEqual({
        ...makeCard(),
        addedAt: '2026-09-03T00:00:00.000Z',
      });
    });

    it('returns the existing row without creating (200 semantics)', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
      prisma.wishlistItem.findUnique.mockResolvedValue({
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      });
      catalog.getVisibleCardsByIds.mockResolvedValue([makeCard()]);

      const result = await service.add(USER_ID, PRODUCT_ID);

      expect(result.created).toBe(false);
      expect(prisma.wishlistItem.create).not.toHaveBeenCalled();
      expect(result.item.addedAt).toBe('2026-09-01T00:00:00.000Z');
    });

    it('rejects unpublished or unknown products with 404', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.add(USER_ID, PRODUCT_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.wishlistItem.create).not.toHaveBeenCalled();
    });

    it('survives a concurrent-insert race as a non-create', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
      prisma.wishlistItem.findUnique.mockResolvedValue(null);
      prisma.wishlistItem.create.mockRejectedValue(new Error('P2002 race'));
      prisma.wishlistItem.findUniqueOrThrow.mockResolvedValue({
        createdAt: new Date('2026-09-03T00:00:00.000Z'),
      });
      catalog.getVisibleCardsByIds.mockResolvedValue([makeCard()]);

      const result = await service.add(USER_ID, PRODUCT_ID);

      expect(result.created).toBe(false);
    });
  });

  describe('remove', () => {
    it('reports removed:true when a row was deleted', async () => {
      prisma.wishlistItem.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.remove(USER_ID, PRODUCT_ID)).resolves.toEqual({
        removed: true,
      });
    });

    it('reports removed:false when nothing was saved (idempotent)', async () => {
      prisma.wishlistItem.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(USER_ID, PRODUCT_ID)).resolves.toEqual({
        removed: false,
      });
    });
  });
});
