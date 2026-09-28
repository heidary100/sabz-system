import { PriceStatus, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { PublicCatalogService } from './public-catalog.service';

/**
 * SS-213 price/stock predicate tests over mocked Prisma. These assert the
 * server-side `where` composition (subtree + brand + condition + q + price +
 * stock) and the reserved-inventory edge cases without a database.
 */
describe('PublicCatalogService listing facets', () => {
  let service: PublicCatalogService;
  let prisma: {
    $queryRaw: jest.Mock;
    category: { findMany: jest.Mock };
    product: { count: jest.Mock; findMany: jest.Mock };
    productVariant: { findMany: jest.Mock; groupBy: jest.Mock };
    inventoryItem: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      category: { findMany: jest.fn().mockResolvedValue([]) },
      product: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      productVariant: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new PublicCatalogService(
      prisma as unknown as PrismaService,
      {
        promotionEndsAtByProduct: jest.fn().mockResolvedValue(new Map()),
        activePromotionsFor: jest.fn().mockResolvedValue([]),
      } as unknown as PricingService,
    );
  });

  it('filters by priceFrom using PRICED variants only', async () => {
    await service.listProducts({ priceFrom: '1500000' });

    expect(prisma.product.count).toHaveBeenCalledTimes(1);
    const where = prisma.product.count.mock.calls[0][0].where;
    expect(where.variants).toEqual({
      some: {
        deletedAt: null,
        priceStatus: PriceStatus.PRICED,
        price: { gte: expect.objectContaining({}) },
      },
    });
    expect(String(where.variants.some.price.gte)).toBe('1500000');
  });

  it('requires the SAME variant to satisfy a bounded range', async () => {
    await service.listProducts({ priceFrom: '1000', priceTo: '2000' });

    const where = prisma.product.count.mock.calls[0][0].where;
    expect(String(where.variants.some.price.gte)).toBe('1000');
    expect(String(where.variants.some.price.lte)).toBe('2000');
    expect(where.variants.some.priceStatus).toBe(PriceStatus.PRICED);
  });

  it('normalizes an inverted range by swapping (shared frontend policy)', async () => {
    await service.listProducts({ priceFrom: '2000', priceTo: '1000' });

    const where = prisma.product.count.mock.calls[0][0].where;
    expect(String(where.variants.some.price.gte)).toBe('1000');
    expect(String(where.variants.some.price.lte)).toBe('2000');
  });

  it('composes price with the category subtree instead of exact match', async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: 'c1', slug: 'storage', parentId: null },
      { id: 'c2', slug: 'storage-child', parentId: 'c1' },
    ]);

    await service.listProducts({ category: 'storage', priceTo: '5000' });

    const where = prisma.product.count.mock.calls[0][0].where;
    expect(where.categoryId).toEqual({ in: expect.arrayContaining(['c1', 'c2']) });
    expect(String(where.variants.some.price.lte)).toBe('5000');
  });

  it('composes brand + condition + price + stock in one where (q absent)', async () => {
    prisma.productVariant.findMany.mockResolvedValue([]);

    await service.listProducts({
      brand: 'orico',
      condition: 'NEW',
      priceFrom: '100',
      inStockOnly: true,
    });

    const where = prisma.product.count.mock.calls[0][0].where;
    expect(where.brand).toEqual({ is: { slug: 'orico', deletedAt: null } });
    expect(where.condition).toBe('NEW');
    expect(where.OR).toBeUndefined();
    expect(where.variants.some.priceStatus).toBe(PriceStatus.PRICED);
    // No available variant exists in the mocked inventory → matches nothing,
    // but the visibility scope must survive the stock narrowing.
    expect(where.id).toEqual({ in: [] });
    expect(where.status).toBe(ProductStatus.PUBLISHED);
  });

  it('routes a meaningful q to the PostgreSQL search query (SS-216)', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'p1', total: 1n }]);
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'n',
        slug: 's',
        condition: 'NEW',
        brand: null,
        category: null,
        variants: [],
        media: [],
      },
    ]);
    prisma.productVariant.groupBy.mockResolvedValue([]);

    const result = await service.listProducts({
      q: 'ssd',
      brand: 'orico',
      condition: 'NEW',
      priceFrom: '100',
    });

    // The search SQL owns matching/ordering; the legacy Prisma count path is
    // not used at all.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.product.count).not.toHaveBeenCalled();
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it('treats a whitespace-only q as absent (no search branch)', async () => {
    await service.listProducts({ q: '   ' });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.product.count).toHaveBeenCalledTimes(1);
  });

  it('includes genuinely available variants and excludes fully-reserved ones', async () => {
    prisma.productVariant.findMany.mockResolvedValue([
      { id: 'v-reserved', productId: 'p1' },
      { id: 'v-free', productId: 'p2' },
    ]);
    prisma.inventoryItem.findMany.mockResolvedValue([
      { variantId: 'v-reserved', quantityOnHand: 5, quantityReserved: 5 },
      { variantId: 'v-free', quantityOnHand: 5, quantityReserved: 3 },
    ]);

    const result = await service.listProducts({ inStockOnly: true });

    expect(result.total).toBe(0);
    const where = prisma.product.count.mock.calls[0][0].where;
    expect(where.id).toEqual({ in: ['p2'] });
  });

  it('keeps the category subtree scope for inStockOnly queries', async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: 'c1', slug: 'storage', parentId: null },
      { id: 'c2', slug: 'storage-nvme', parentId: 'c1' },
    ]);
    prisma.productVariant.findMany.mockResolvedValue([
      { id: 'v1', productId: 'p1' },
    ]);
    prisma.inventoryItem.findMany.mockResolvedValue([
      { variantId: 'v1', quantityOnHand: 2, quantityReserved: 0 },
    ]);

    await service.listProducts({ category: 'storage', inStockOnly: true });

    // The variant prefilter itself must carry the subtree scope…
    const variantWhere = prisma.productVariant.findMany.mock.calls[0][0].where;
    expect(variantWhere.product.is.categoryId).toEqual({
      in: expect.arrayContaining(['c1', 'c2']),
    });
    // …and the final product query keeps it alongside the stock narrowing.
    const where = prisma.product.count.mock.calls[0][0].where;
    expect(where.categoryId).toEqual({
      in: expect.arrayContaining(['c1', 'c2']),
    });
    expect(where.id).toEqual({ in: ['p1'] });
  });

  it('reports pagination totals against the narrowed set', async () => {
    prisma.product.count.mockResolvedValue(7);
    prisma.product.findMany.mockResolvedValue([]);

    const result = await service.listProducts({
      priceFrom: '100',
      page: 2,
      limit: 24,
    });

    expect(result).toEqual({ items: [], total: 7, page: 2, limit: 24 });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 24, take: 24 }),
    );
  });
});
