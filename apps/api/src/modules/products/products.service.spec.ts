import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from './products.service';

const now = new Date('2026-08-19T00:00:00.000Z');

function makeListRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    name: 'لپتاپ دل XPS 13',
    slug: 'dell-xps-13',
    condition: 'NEW',
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    brand: { id: 'brand-1', name: 'دل', slug: 'dell', description: null },
    category: {
      id: 'cat-1',
      name: 'لپتاپ',
      slug: 'laptop',
      parentId: null,
      sortOrder: 0,
      isVisible: true,
    },
    ...overrides,
  };
}

function makeDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    name: 'لپتاپ دل XPS 13',
    slug: 'dell-xps-13',
    shortDescription: null,
    description: null,
    warranty: null,
    condition: 'NEW',
    status: 'DRAFT',
    weightKg: null,
    widthCm: null,
    heightCm: null,
    depthCm: null,
    originCountry: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    brand: { id: 'brand-1', name: 'دل', slug: 'dell', description: null },
    category: {
      id: 'cat-1',
      name: 'لپتاپ',
      slug: 'laptop',
      parentId: null,
      sortOrder: 0,
      isVisible: true,
    },
    variants: [
      {
        id: 'var-1',
        productId: 'prod-1',
        sku: 'XPS13-BASE',
        barcode: null,
        name: null,
        price: { toString: () => '1500.00' },
        stockQuantity: 5,
      },
    ],
    media: [],
    ...overrides,
  };
}

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: {
    product: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    productVariant: { count: jest.Mock };
    brand: { findUnique: jest.Mock };
    category: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let tx: TxMock;

  beforeEach(() => {
    tx = {
      product: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      productVariant: { count: jest.fn() },
      brand: { findUnique: jest.fn() },
      category: { findUnique: jest.fn() },
    };
    prisma = {
      product: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      productVariant: { count: jest.fn() },
      brand: { findUnique: jest.fn() },
      category: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };

    // Most mutations run inside $transaction(async (tx) => ...). Capture tx by
    // delegating to the same mocked clients by default.
    prisma.$transaction.mockImplementation(
      (arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(tx);
        }
        if (Array.isArray(arg)) {
          return Promise.all(arg as Promise<unknown>[]);
        }
        return arg;
      },
    );

    service = new ProductsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('list', () => {
    it('builds the query with default pagination, deletedAt null and deterministic ordering', async () => {
      prisma.product.count.mockResolvedValue(1);
      prisma.product.findMany.mockResolvedValue([makeListRow()]);

      const result = await service.list({});

      expect(result).toEqual({
        items: [
          {
            id: 'prod-1',
            name: 'لپتاپ دل XPS 13',
            slug: 'dell-xps-13',
            condition: 'NEW',
            status: 'DRAFT',
            brand: { id: 'brand-1', name: 'دل', slug: 'dell', description: null },
            category: {
              id: 'cat-1',
              name: 'لپتاپ',
              slug: 'laptop',
              parentId: null,
              sortOrder: 0,
              isVisible: true,
            },
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 0,
          take: 20,
        }),
      );
    });

    it('applies status, categoryId, brandId filters and OR search on name/slug', async () => {
      prisma.product.count.mockResolvedValue(0);
      prisma.product.findMany.mockResolvedValue([]);

      await service.list({
        page: 2,
        limit: 10,
        search: 'dell',
        status: ProductStatus.PUBLISHED,
        categoryId: 'cat-9',
        brandId: 'brand-9',
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PUBLISHED',
            categoryId: 'cat-9',
            brandId: 'brand-9',
            OR: [
              { name: { contains: 'dell', mode: 'insensitive' } },
              { slug: { contains: 'dell', mode: 'insensitive' } },
            ],
          }),
          skip: 10,
          take: 10,
        }),
      );
    });

    it('escapes LIKE wildcards in search terms', async () => {
      prisma.product.count.mockResolvedValue(0);
      prisma.product.findMany.mockResolvedValue([]);

      await service.list({ search: '50%' });

      const args = prisma.product.findMany.mock.calls[0][0];
      expect(args.where.OR[0].name.contains).toBe('50\\%');
    });
  });

  describe('getDetail', () => {
    it('returns a ProductDetail with Decimal values serialized to strings and no internal fields', async () => {
      prisma.product.findUnique.mockResolvedValue(
        makeDetailRow({
          weightKg: { toString: () => '1.500' },
          widthCm: { toString: () => '30.00' },
          variants: [
            {
              id: 'var-1',
              productId: 'prod-1',
              sku: 'XPS13-BASE',
              barcode: null,
              name: null,
              price: { toString: () => '1500.00' },
              stockQuantity: 5,
            },
          ],
        }),
      );

      const result = await service.getDetail('prod-1');

      expect(result.weightKg).toBe('1.500');
      expect(result.widthCm).toBe('30.00');
      expect(result.variants[0]!.price).toBe('1500.00');
      expect(JSON.stringify(result)).not.toContain('deletedAt');
      expect(JSON.stringify(result)).not.toContain('storageKey');
      expect(JSON.stringify(result)).not.toContain('logoKey');
      expect(JSON.stringify(result)).not.toContain('createdBy');
      expect(JSON.stringify(result)).not.toContain('updatedBy');
    });

    it('throws 404 when the product is soft-deleted', async () => {
      prisma.product.findUnique.mockResolvedValue(
        makeDetailRow({ deletedAt: now }),
      );
      await expect(service.getDetail('prod-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when the product is missing', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.getDetail('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.brand.findUnique.mockResolvedValue({
        id: 'brand-1',
        deletedAt: null,
      });
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat-1',
        deletedAt: null,
      });
      tx.product.create = jest.fn().mockResolvedValue(makeDetailRow());
      tx.brand = prisma.brand;
      tx.category = prisma.category;
    });

    it('creates a DRAFT product, generates a slug from name, and audits PRODUCT_CREATED', async () => {
      const created = await service.create(
        {
          name: 'لپتاپ دل XPS 13',
          brandId: 'brand-1',
          categoryId: 'cat-1',
          condition: 'NEW',
        },
        'actor-1',
      );

      expect(created.status).toBe('DRAFT');
      expect(tx.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DRAFT' }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_CREATED',
          entity: 'Product',
          userId: 'actor-1',
          before: null,
          after: expect.objectContaining({ status: 'DRAFT' }),
        }),
        tx,
      );
    });

    it('rejects a non-DRAFT status on create with 400', async () => {
      await expect(
        service.create(
          {
            name: 'x',
            slug: 'x',
            brandId: 'brand-1',
            categoryId: 'cat-1',
            condition: 'NEW',
            status: ProductStatus.PUBLISHED,
          },
          'actor-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.product.create).not.toHaveBeenCalled();
    });

    it('throws 404 when the brand is soft-deleted', async () => {
      prisma.brand.findUnique.mockResolvedValue({
        id: 'brand-1',
        deletedAt: now,
      });
      await expect(
        service.create(
          {
            name: 'x',
            brandId: 'brand-1',
            categoryId: 'cat-1',
            condition: 'NEW',
          },
          'actor-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when the category is missing', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(
        service.create(
          {
            name: 'x',
            brandId: 'brand-1',
            categoryId: 'cat-1',
            condition: 'NEW',
          },
          'actor-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 409 on a P2002 slug race', async () => {
      tx.product.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { modelName: 'Product' },
        }),
      );
      await expect(
        service.create(
          {
            name: 'x',
            slug: 'dup-slug',
            brandId: 'brand-1',
            categoryId: 'cat-1',
            condition: 'NEW',
          },
          'actor-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    const target = {
      id: 'prod-1',
      status: 'DRAFT',
      deletedAt: null,
      name: 'old name',
      slug: 'old-slug',
      shortDescription: null,
      description: null,
      brandId: 'brand-1',
      categoryId: 'cat-1',
      warranty: null,
      condition: 'NEW',
      weightKg: null,
      widthCm: null,
      heightCm: null,
      depthCm: null,
      originCountry: null,
    };

    beforeEach(() => {
      tx.product.findUnique = jest
        .fn()
        .mockImplementation((args: { select?: Record<string, unknown> }) => {
          const select = args?.select;
          if (select && !('variants' in select)) {
            return Promise.resolve(target);
          }
          return Promise.resolve(makeDetailRow());
        });
      tx.product.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      tx.brand.findUnique = jest.fn().mockResolvedValue({
        id: 'brand-1',
        deletedAt: null,
      });
      tx.category.findUnique = jest.fn().mockResolvedValue({
        id: 'cat-1',
        deletedAt: null,
      });
      // The detail re-read after update.
      prisma.product.findUnique.mockResolvedValue(makeDetailRow());
    });

    it('updates only changed fields and audits a business delta without status', async () => {
      const result = await service.update(
        'prod-1',
        { name: 'new name' },
        'actor-1',
      );

      expect(tx.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'prod-1',
            deletedAt: null,
            status: { not: 'ARCHIVED' },
          }),
          data: expect.objectContaining({ name: 'new name', updatedBy: 'actor-1' }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_UPDATED',
          before: { name: 'old name' },
          after: { name: 'new name' },
        }),
        tx,
      );
      expect(result.id).toBe('prod-1');
    });

    it('throws 409 when the product is archived (no resurrection)', async () => {
      tx.product.findUnique.mockResolvedValueOnce({
        ...target,
        status: 'ARCHIVED',
      });
      await expect(
        service.update('prod-1', { name: 'x' }, 'actor-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.product.updateMany).not.toHaveBeenCalled();
    });

    it('throws 404 when the product is soft-deleted', async () => {
      tx.product.findUnique.mockResolvedValueOnce({
        ...target,
        deletedAt: now,
      });
      await expect(
        service.update('prod-1', { name: 'x' }, 'actor-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 409 on a P2002 slug race', async () => {
      tx.product.updateMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { modelName: 'Product' },
        }),
      );
      await expect(
        service.update('prod-1', { slug: 'dup' }, 'actor-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('is a no-op (no update, no audit) when nothing changed', async () => {
      await service.update('prod-1', {}, 'actor-1');
      expect(tx.product.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('throws 409 when the guarded updateMany matches zero rows (concurrent archive/delete race)', async () => {
      tx.product.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.update('prod-1', { name: 'x' }, 'actor-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    beforeEach(() => {
      tx.product.findUnique = jest.fn().mockResolvedValue({
        id: 'prod-1',
        status: 'DRAFT',
        deletedAt: null,
      });
      tx.product.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      tx.productVariant.count = jest.fn().mockResolvedValue(1);
      prisma.product.findUnique.mockResolvedValue(makeDetailRow());
    });

    it('publishes a DRAFT product with a variant and audits PRODUCT_PUBLISHED', async () => {
      const result = await service.publish('prod-1', 'actor-1');

      expect(tx.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'prod-1',
            status: 'DRAFT',
            deletedAt: null,
          },
          data: { status: 'PUBLISHED', updatedBy: 'actor-1' },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_PUBLISHED',
          before: { status: 'DRAFT' },
          after: { status: 'PUBLISHED' },
        }),
        tx,
      );
      expect(result.id).toBe('prod-1');
    });

    it('throws 409 when there is no variant', async () => {
      tx.productVariant.count.mockResolvedValue(0);
      await expect(service.publish('prod-1', 'actor-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.product.updateMany).not.toHaveBeenCalled();
    });

    it('throws 409 when not DRAFT', async () => {
      tx.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        status: 'PUBLISHED',
        deletedAt: null,
      });
      await expect(service.publish('prod-1', 'actor-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws 409 when the conditional updateMany matches zero rows (race)', async () => {
      tx.product.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.publish('prod-1', 'actor-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws 404 when the product is missing or soft-deleted', async () => {
      tx.product.findUnique.mockResolvedValue(null);
      await expect(service.publish('prod-1', 'actor-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('archive', () => {
    beforeEach(() => {
      tx.product.findUnique = jest.fn().mockResolvedValue({
        id: 'prod-1',
        status: 'PUBLISHED',
        deletedAt: null,
      });
      tx.product.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      prisma.product.findUnique.mockResolvedValue(makeDetailRow());
    });

    it('archives a PUBLISHED product and audits PRODUCT_ARCHIVED', async () => {
      const result = await service.archive('prod-1', 'actor-1');

      expect(tx.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-1', status: 'PUBLISHED', deletedAt: null },
          data: { status: 'ARCHIVED', updatedBy: 'actor-1' },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_ARCHIVED',
          before: { status: 'PUBLISHED' },
          after: { status: 'ARCHIVED' },
        }),
        tx,
      );
      expect(result.id).toBe('prod-1');
    });

    it('throws 409 when not PUBLISHED', async () => {
      tx.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        status: 'DRAFT',
        deletedAt: null,
      });
      await expect(service.archive('prod-1', 'actor-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws 409 on race (count 0)', async () => {
      tx.product.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.archive('prod-1', 'actor-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('softDelete', () => {
    beforeEach(() => {
      tx.product.findUnique = jest
        .fn()
        .mockImplementation((args: { select?: Record<string, unknown> }) => {
          const select = args?.select;
          if (select && !('variants' in select)) {
            return Promise.resolve({
              id: 'prod-1',
              status: 'ARCHIVED',
              deletedAt: null,
            });
          }
          return Promise.resolve(makeDetailRow());
        });
      tx.product.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    });

    it('soft-deletes an ARCHIVED product and audits PRODUCT_DELETED', async () => {
      const result = await service.softDelete('prod-1', 'actor-1');

      expect(tx.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-1', status: 'ARCHIVED', deletedAt: null },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            updatedBy: 'actor-1',
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_DELETED',
          before: { status: 'ARCHIVED' },
          after: { deletedAt: expect.any(String) },
        }),
        tx,
      );
      expect(result.id).toBe('prod-1');
    });

    it('throws 409 when not ARCHIVED', async () => {
      tx.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        status: 'DRAFT',
        deletedAt: null,
      });
      await expect(service.softDelete('prod-1', 'actor-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws 404 when already soft-deleted', async () => {
      tx.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        status: 'ARCHIVED',
        deletedAt: now,
      });
      await expect(service.softDelete('prod-1', 'actor-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when the target is missing', async () => {
      tx.product.findUnique.mockResolvedValue(null);
      await expect(service.softDelete('prod-1', 'actor-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

interface TxMock {
  product: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
  };
  productVariant: { count: jest.Mock };
  brand: { findUnique: jest.Mock };
  category: { findUnique: jest.Mock };
}
