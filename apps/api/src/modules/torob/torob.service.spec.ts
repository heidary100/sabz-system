import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import {
  slugFromPageUrl,
  TorobService,
} from './torob.service';

const PRODUCT_ID = '7fa85f64-5717-4562-b3fc-2c963f66afa6';

function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    name: 'گوشی موبایل مدل ایکس',
    slug: 'mobile-x',
    subtitle: 'نسخه ۲۵۶ گیگابایت',
    shortDescription: 'توضیح کوتاه محصول',
    warranty: '۱۸ ماه گارانتی شرکتی',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    category: { name: 'کالای دیجیتال' },
    variants: [
      {
        id: 'variant-1',
        price: new Prisma.Decimal('1234567'),
        compareAtPrice: new Prisma.Decimal('2000000'),
      },
      {
        id: 'variant-2',
        price: new Prisma.Decimal('5000000'),
        compareAtPrice: null,
      },
    ],
    media: [
      { id: 'media-second', isPrimary: false, sortOrder: 2, mediaType: 'IMAGE' },
      { id: 'media-primary', isPrimary: true, sortOrder: 1, mediaType: 'IMAGE' },
      { id: 'media-video', isPrimary: false, sortOrder: 0, mediaType: 'VIDEO' },
    ],
    specs: [
      { attributeValue: { value: 'گرین لاین', attribute: { name: 'برند' } } },
    ],
    ...overrides,
  };
}

function serviceWith(
  prismaMock: Record<string, unknown>,
  configValues: Record<string, string> = {},
): TorobService {
  const config = {
    get: jest.fn((key: string, defaultValue?: unknown) =>
      key in configValues ? configValues[key] : defaultValue,
    ),
  };
  return new TorobService(
    prismaMock as unknown as PrismaService,
    config as never,
  );
}

describe('TorobService (SS-239)', () => {
  let prisma: {
    product: { count: jest.Mock; findMany: jest.Mock };
    inventoryItem: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      product: { count: jest.fn(), findMany: jest.fn() },
      inventoryItem: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.inventoryItem.findMany.mockResolvedValue([
      { variantId: 'variant-1', quantityOnHand: 5, quantityReserved: 2 },
      { variantId: 'variant-2', quantityOnHand: 2, quantityReserved: 2 },
    ]);
  });

  describe('page mode', () => {
    it('returns the envelope with product-grained totals and feed rows', async () => {
      prisma.$transaction.mockResolvedValue([2, [productRow()]]);
      const response = await serviceWith(prisma).getProducts({
        page: 1,
        sort: 'date_added_desc',
      });

      expect(response).toEqual({
        api_version: 'torob_api_v3',
        current_page: 1,
        total: 2,
        max_pages: 1,
        next_cursor: null,
        products: [
          {
            page_unique: 'mobile-x',
            page_url: 'http://localhost:3002/products/mobile-x',
            product_group_id: PRODUCT_ID,
            title: 'گوشی موبایل مدل ایکس',
            subtitle: 'نسخه ۲۵۶ گیگابایت',
            current_price: 123456,
            old_price: 200000,
            availability: true,
            category_name: 'کالای دیجیتال',
            image_links: [
              'http://localhost:3000/api/v1/catalog/media/media-primary',
              'http://localhost:3000/api/v1/catalog/media/media-second',
            ],
            short_desc: 'توضیح کوتاه محصول',
            spec: { برند: 'گرین لاین' },
            guarantee: '۱۸ ماه گارانتی شرکتی',
            date_added: '2026-01-01T00:00:00.000Z',
            date_updated: '2026-01-02T00:00:00.000Z',
          },
          {
            page_unique: 'mobile-x',
            page_url: 'http://localhost:3002/products/mobile-x',
            product_group_id: PRODUCT_ID,
            title: 'گوشی موبایل مدل ایکس',
            subtitle: 'نسخه ۲۵۶ گیگابایت',
            current_price: 500000,
            availability: false,
            category_name: 'کالای دیجیتال',
            image_links: [
              'http://localhost:3000/api/v1/catalog/media/media-primary',
              'http://localhost:3000/api/v1/catalog/media/media-second',
            ],
            short_desc: 'توضیح کوتاه محصول',
            spec: { برند: 'گرین لاین' },
            guarantee: '۱۸ ماه گارانتی شرکتی',
            date_added: '2026-01-01T00:00:00.000Z',
            date_updated: '2026-01-02T00:00:00.000Z',
          },
        ],
      });
    });

    it('floors the Rial→Toman conversion (÷10) rather than rounding', async () => {
      prisma.$transaction.mockResolvedValue([
        1,
        [
          productRow({
            variants: [
              {
                id: 'variant-1',
                price: new Prisma.Decimal('1234567'),
                compareAtPrice: null,
              },
            ],
          }),
        ],
      ]);
      const response = await serviceWith(prisma).getProducts({
        page: 1,
        sort: 'product_id_desc',
      });
      expect(response.products[0]!.current_price).toBe(123456);
      expect(response.products[0]!.old_price).toBeUndefined();
    });

    it('omits optional fields when null and date_updated when never updated', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.$transaction.mockResolvedValue([
        1,
        [
          productRow({
            subtitle: null,
            shortDescription: null,
            warranty: null,
            updatedAt: createdAt,
            variants: [
              {
                id: 'variant-1',
                price: new Prisma.Decimal('1234567'),
                compareAtPrice: null,
              },
            ],
          }),
        ],
      ]);
      const response = await serviceWith(prisma).getProducts({
        page: 1,
        sort: 'date_added_desc',
      });
      const row = response.products[0]!;
      expect(row.subtitle).toBeUndefined();
      expect(row.short_desc).toBeUndefined();
      expect(row.guarantee).toBeUndefined();
      expect(row.date_updated).toBeUndefined();
      expect(row.old_price).toBeUndefined();
    });

    it('queries the published visibility predicate with product-grained pagination', async () => {
      prisma.$transaction.mockResolvedValue([0, []]);
      await serviceWith(prisma).getProducts({ page: 3, sort: 'date_updated_desc' });

      expect(prisma.product.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          deletedAt: null,
          status: 'PUBLISHED',
          variants: {
            some: { deletedAt: null, priceStatus: 'PRICED' },
          },
        }),
      });
      const transactionArg = prisma.$transaction.mock.calls[0][0] as unknown[];
      expect(transactionArg).toHaveLength(2);
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip: 200,
          take: 100,
        }),
      );
      const select = prisma.product.findMany.mock.calls[0][0].select;
      expect(select.variants.where).toEqual({
        deletedAt: null,
        priceStatus: 'PRICED',
      });
    });

    it('configures the absolute URL bases from config', async () => {
      prisma.$transaction.mockResolvedValue([1, [productRow()]]);
      const service = serviceWith(prisma, {
        TOROB_FEED_STOREFRONT_BASE_URL: 'https://sabzsistem.com/',
        TOROB_FEED_API_BASE_URL: 'https://api.sabzsistem.com',
      });
      const response = await service.getProducts({
        page: 1,
        sort: 'date_added_desc',
      });
      expect(response.products[0]!.page_url).toBe(
        'https://sabzsistem.com/products/mobile-x',
      );
      expect(response.products[0]!.image_links[0]).toBe(
        'https://api.sabzsistem.com/api/v1/catalog/media/media-primary',
      );
    });
  });

  describe('cursor mode', () => {
    it('emits next_cursor only when more products remain', async () => {
      const fullPage = Array.from({ length: 101 }, (_, index) =>
        productRow({ id: `p-${index}`, slug: `p-${index}` }),
      );
      prisma.product.findMany.mockResolvedValueOnce(fullPage);
      const service = serviceWith(prisma);
      const response = await service.getProducts({
        cursor: 'stale-or-first',
        sort: 'date_added_desc',
      });
      // An undecodable cursor degrades to a fresh sweep, not an error.
      expect(response.total).toBeNull();
      expect(response.next_cursor).toBeDefined();
      const last = response.products[response.products.length - 1]!;

      prisma.product.findMany.mockResolvedValueOnce([
        productRow({ id: 'p-last', slug: 'p-last' }),
      ]);
      const second = await service.getProducts({
        cursor: Buffer.from(
          JSON.stringify({
            v: 1,
            k: '2026-01-02T00:00:00.000Z',
            i: last.product_group_id,
          }),
        ).toString('base64url'),
        sort: 'date_added_desc',
      });
      expect(second.next_cursor).toBeNull();
      const where = prisma.product.findMany.mock.calls[1][0].where.AND;
      expect(where[1]).toEqual({
        OR: [
          { createdAt: { lt: new Date('2026-01-02T00:00:00.000Z') } },
          {
            createdAt: new Date('2026-01-02T00:00:00.000Z'),
            id: { lt: last.product_group_id },
          },
        ],
      });
    });

    it('uses an id predicate for product_id_desc cursors', async () => {
      prisma.product.findMany.mockResolvedValueOnce([]);
      const service = serviceWith(prisma);
      await service.getProducts({
        cursor: Buffer.from(JSON.stringify({ v: 1, k: 'p-0', i: 'p-0' })).toString(
          'base64url',
        ),
        sort: 'product_id_desc',
      });
      const where = prisma.product.findMany.mock.calls[0][0].where.AND;
      expect(where[1]).toEqual({ id: { lt: 'p-0' } });
    });
  });

  describe('page_urls / page_uniques lookups', () => {
    it('extracts slugs from storefront page URLs', () => {
      expect(slugFromPageUrl('https://sabzsistem.com/products/mobile-x')).toBe(
        'mobile-x',
      );
      expect(
        slugFromPageUrl('https://sabzsistem.com/products/mobile-x?utm=torob'),
      ).toBe('mobile-x');
      expect(slugFromPageUrl('https://sabzsistem.com/blog/post-1')).toBeNull();
      expect(slugFromPageUrl('not a url')).toBeNull();
    });

    it('matches products by slug and ignores unparseable URLs', async () => {
      prisma.product.findMany.mockResolvedValueOnce([productRow()]);
      const response = await serviceWith(prisma).getProducts({
        page_urls: [
          'https://sabzsistem.com/products/mobile-x',
          'https://sabzsistem.com/blog/post-1',
        ],
      });
      expect(response.products).toHaveLength(2);
      const where = prisma.product.findMany.mock.calls[0][0].where
        .AND as Record<string, unknown>[];
      expect(where[1]).toEqual({ slug: { in: ['mobile-x'] } });
      expect(response.total).toBe(1);
      expect(response.max_pages).toBeNull();
    });

    it('treats page_uniques as slugs and short-circuits an empty lookup', async () => {
      const service = serviceWith(prisma);
      const empty = await service.getProducts({ page_uniques: [] });
      expect(empty.products).toEqual([]);
      expect(empty.total).toBe(0);
      expect(prisma.product.findMany).not.toHaveBeenCalled();

      prisma.product.findMany.mockResolvedValueOnce([]);
      await service.getProducts({ page_uniques: ['mobile-x'] });
      const uniquesWhere = prisma.product.findMany.mock.calls[0][0].where
        .AND as Record<string, unknown>[];
      expect(uniquesWhere[1]).toEqual({ slug: { in: ['mobile-x'] } });
    });
  });
});
