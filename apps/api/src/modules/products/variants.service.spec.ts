import { PriceStatus, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VariantsService } from './variants.service';

function makeVariantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'var-1',
    productId: 'prod-1',
    sku: 'XPS13-BASE',
    barcode: null,
    name: null,
    price: { toString: () => '1500.00' },
    compareAtPrice: null,
    priceStatus: 'PRICED',
    deletedAt: null,
    ...overrides,
  };
}

function makeProductRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    status: ProductStatus.DRAFT,
    deletedAt: null,
    ...overrides,
  };
}

type TxMock = {
  product: {
    findUnique: jest.Mock;
  };
  productVariant: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  auditLog: { create: jest.Mock };
};

describe('VariantsService', () => {
  let service: VariantsService;
  let prisma: {
    product: { findUnique: jest.Mock };
    productVariant: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let tx: TxMock;

  beforeEach(() => {
    tx = {
      product: { findUnique: jest.fn() },
      productVariant: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    prisma = {
      product: { findUnique: jest.fn() },
      productVariant: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };

    prisma.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return arg(tx);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg as Promise<unknown>[]);
      }
      return arg;
    });

    service = new VariantsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('list', () => {
    it('returns only non-deleted variants for an existing product', async () => {
      prisma.product.findUnique.mockResolvedValue(makeProductRow());
      prisma.productVariant.findMany.mockResolvedValue([
        makeVariantRow({ deletedAt: null }),
      ]);

      const result = await service.list('prod-1');

      expect(prisma.productVariant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: 'prod-1', deletedAt: null },
        }),
      );
      expect(result[0]!.price).toBe('1500.00');
      expect(JSON.stringify(result)).not.toContain('deletedAt');
    });

    it('throws 404 when the product is missing or soft-deleted', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.list('prod-1')).rejects.toMatchObject({
        status: 404,
      });

      prisma.product.findUnique.mockResolvedValue(
        makeProductRow({ deletedAt: new Date() }),
      );
      await expect(service.list('prod-1')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('getDetail', () => {
    it('returns a VariantSummary with price as string and no internal fields', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(makeVariantRow());

      const result = await service.getDetail('var-1');

      expect(result).toEqual({
        id: 'var-1',
        productId: 'prod-1',
        sku: 'XPS13-BASE',
        barcode: null,
        name: null,
        price: '1500.00',
        compareAtPrice: null,
        priceStatus: 'PRICED',
      });
    });

    it('throws 404 for a soft-deleted or missing variant', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(
        makeVariantRow({ deletedAt: new Date() }),
      );
      await expect(service.getDetail('var-1')).rejects.toMatchObject({
        status: 404,
      });

      prisma.productVariant.findUnique.mockResolvedValue(null);
      await expect(service.getDetail('var-1')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('create', () => {
    it('creates a variant and audits PRODUCT_VARIANT_CREATED', async () => {
      tx.product.findUnique.mockResolvedValue(makeProductRow());
      tx.productVariant.create.mockResolvedValue(makeVariantRow());
      audit.log.mockResolvedValue(undefined);

      const result = await service.create(
        'prod-1',
        { sku: 'XPS13-BASE', price: '1500.00' },
        'actor-1',
        '127.0.0.1',
      );

      expect(result.sku).toBe('XPS13-BASE');
      expect(tx.productVariant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productId: 'prod-1',
            sku: 'XPS13-BASE',
            price: '1500.00',
            createdBy: 'actor-1',
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_VARIANT_CREATED',
          entity: 'ProductVariant',
          entityId: 'var-1',
          after: expect.objectContaining({ price: '1500.00' }),
        }),
        tx,
      );
    });

    it('throws 404 when the product is soft-deleted', async () => {
      tx.product.findUnique.mockResolvedValue(
        makeProductRow({ deletedAt: new Date() }),
      );
      await expect(
        service.create('prod-1', { sku: 'S', price: '1.00' }, 'actor-1'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('throws 409 when the product is archived', async () => {
      tx.product.findUnique.mockResolvedValue(
        makeProductRow({ status: ProductStatus.ARCHIVED }),
      );
      await expect(
        service.create('prod-1', { sku: 'S', price: '1.00' }, 'actor-1'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('throws 409 on a duplicate SKU via P2002', async () => {
      tx.product.findUnique.mockResolvedValue(makeProductRow());
      tx.productVariant.create.mockRejectedValue(
        Object.assign(
          new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'test',
          }),
          { meta: { modelName: 'ProductVariant' } },
        ),
      );

      await expect(
        service.create('prod-1', { sku: 'DUP', price: '1.00' }, 'actor-1'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('persists compareAtPrice and priceStatus on create', async () => {
      tx.product.findUnique.mockResolvedValue(makeProductRow());
      tx.productVariant.create.mockResolvedValue(
        makeVariantRow({
          price: { toString: () => '1500.00' },
          compareAtPrice: { toString: () => '1800.00' },
          priceStatus: 'PRICED',
        }),
      );
      audit.log.mockResolvedValue(undefined);

      const result = await service.create(
        'prod-1',
        { sku: 'SALE', price: '1500.00', compareAtPrice: '1800.00' },
        'actor-1',
      );

      expect(result.compareAtPrice).toBe('1800.00');
      expect(tx.productVariant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            compareAtPrice: '1800.00',
            priceStatus: 'PRICED',
          }),
        }),
      );
    });

    it('rejects compareAtPrice at or below price on create', async () => {
      await expect(
        service.create(
          'prod-1',
          { sku: 'S', price: '1500.00', compareAtPrice: '1500.00' },
          'actor-1',
        ),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.create(
          'prod-1',
          { sku: 'S', price: '1500.00', compareAtPrice: '1400.00' },
          'actor-1',
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects compareAtPrice on a CALL_FOR_PRICE create', async () => {
      await expect(
        service.create(
          'prod-1',
          {
            sku: 'S',
            price: '0',
            compareAtPrice: '1800.00',
            priceStatus: PriceStatus.CALL_FOR_PRICE,
          },
          'actor-1',
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('update', () => {
    it('updates sku/price and audits PRODUCT_VARIANT_UPDATED with deltas', async () => {
      tx.product.findUnique.mockResolvedValue(makeProductRow());
      tx.productVariant.findUnique
        .mockResolvedValueOnce(makeVariantRow({ price: { toString: () => '1500.00' } })) // target
        .mockResolvedValueOnce(
          makeVariantRow({ sku: 'NEW-SKU', price: { toString: () => '2000.00' } }),
        ); // current
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.update(
        'var-1',
        { sku: 'NEW-SKU', price: '2000.00' },
        'actor-1',
      );

      expect(result.sku).toBe('NEW-SKU');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_VARIANT_UPDATED',
          before: { sku: 'XPS13-BASE', price: '1500.00' },
          after: { sku: 'NEW-SKU', price: '2000.00' },
        }),
        tx,
      );
      expect(tx.productVariant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'var-1',
            deletedAt: null,
            product: { is: { deletedAt: null, status: { not: ProductStatus.ARCHIVED } } },
          }),
          data: expect.objectContaining({ sku: 'NEW-SKU', updatedBy: 'actor-1' }),
        }),
      );
    });

    it('returns the target unchanged when the body has no fields', async () => {
      tx.product.findUnique.mockResolvedValue(makeProductRow());
      tx.productVariant.findUnique.mockResolvedValue(makeVariantRow());

      const result = await service.update('var-1', {}, 'actor-1');
      expect(result.id).toBe('var-1');
      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    });

    it('throws 404 for a soft-deleted variant', async () => {
      tx.productVariant.findUnique.mockResolvedValue(
        makeVariantRow({ deletedAt: new Date() }),
      );
      await expect(
        service.update('var-1', { sku: 'S' }, 'actor-1'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('throws 409 for a duplicate SKU on update', async () => {
      tx.product.findUnique.mockResolvedValue(makeProductRow());
      tx.productVariant.findUnique
        .mockResolvedValueOnce(makeVariantRow())
        .mockResolvedValueOnce(makeVariantRow());
      tx.productVariant.updateMany.mockRejectedValue(
        Object.assign(
          new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'test',
          }),
          { meta: { modelName: 'ProductVariant' } },
        ),
      );

      await expect(
        service.update('var-1', { sku: 'DUP' }, 'actor-1'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('rejects lowering price at or below the stored compareAtPrice', async () => {
      tx.product.findUnique.mockResolvedValue(makeProductRow());
      tx.productVariant.findUnique.mockResolvedValue(
        makeVariantRow({
          price: { toString: () => '1500.00' },
          compareAtPrice: { toString: () => '1800.00' },
          priceStatus: 'PRICED',
        }),
      );

      await expect(
        service.update('var-1', { price: '1800.00' }, 'actor-1'),
      ).rejects.toMatchObject({ status: 400 });
      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    });

    it('rejects adding compareAtPrice to a CALL_FOR_PRICE variant', async () => {
      tx.product.findUnique.mockResolvedValue(makeProductRow());
      tx.productVariant.findUnique.mockResolvedValue(
        makeVariantRow({ priceStatus: 'CALL_FOR_PRICE' }),
      );

      await expect(
        service.update('var-1', { compareAtPrice: '2000.00' }, 'actor-1'),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('clears compareAtPrice and flips status in one update with audit deltas', async () => {
      tx.product.findUnique.mockResolvedValue(makeProductRow());
      tx.productVariant.findUnique
        .mockResolvedValueOnce(
          makeVariantRow({
            compareAtPrice: { toString: () => '1800.00' },
            priceStatus: 'PRICED',
          }),
        ) // target
        .mockResolvedValueOnce(
          makeVariantRow({
            compareAtPrice: null,
            priceStatus: 'CALL_FOR_PRICE',
          }),
        ); // current
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.update(
        'var-1',
        { compareAtPrice: null, priceStatus: PriceStatus.CALL_FOR_PRICE },
        'actor-1',
      );

      expect(result.priceStatus).toBe('CALL_FOR_PRICE');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_VARIANT_UPDATED',
          before: { compareAtPrice: '1800.00', priceStatus: 'PRICED' },
          after: { compareAtPrice: null, priceStatus: 'CALL_FOR_PRICE' },
        }),
        tx,
      );
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt and audits PRODUCT_VARIANT_DELETED', async () => {
      tx.productVariant.findUnique.mockResolvedValue(
        makeVariantRow({ price: { toString: () => '100.00' } }),
      );
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.softDelete('var-1', 'actor-1');

      expect(result.id).toBe('var-1');
      expect(tx.productVariant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'var-1', deletedAt: null },
          data: expect.objectContaining({ deletedAt: expect.any(Date), updatedBy: 'actor-1' }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_VARIANT_DELETED',
          before: { deletedAt: null },
          after: expect.objectContaining({ deletedAt: expect.any(String) }),
        }),
        tx,
      );
    });

    it('throws 404 for a missing variant', async () => {
      tx.productVariant.findUnique.mockResolvedValue(null);
      await expect(
        service.softDelete('var-1', 'actor-1'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('audit payload safety', () => {
    it('never serializes price as a number in audit payloads', async () => {
      tx.product.findUnique.mockResolvedValue(makeProductRow());
      tx.productVariant.create.mockResolvedValue(
        makeVariantRow({ price: { toString: () => '1500.00' } }),
      );
      audit.log.mockImplementation((entry: unknown) => {
        expect((entry as { after: { price: unknown } }).after.price).toBe('1500.00');
      });

      await service.create('prod-1', { sku: 'S', price: '1500.00' }, 'actor-1');
    });
  });
});
