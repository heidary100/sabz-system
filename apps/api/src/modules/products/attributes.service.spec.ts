import { AttributeType, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AttributesService } from './attributes.service';

function p2002(model: string) {
  return Object.assign(
    new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    }),
    { meta: { modelName: model } },
  );
}

describe('AttributesService (SS-202)', () => {
  interface ModelMock {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
    count: jest.Mock;
  }

  let service: AttributesService;
  let prisma: {
    attribute: ModelMock;
    attributeValue: ModelMock;
    product: ModelMock;
    productVariant: ModelMock;
    productAttributeValue: ModelMock;
    variantAttributeValue: ModelMock;
    $transaction: jest.Mock;
  };

  function mockModel(): ModelMock {
    return {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    };
  }

  beforeEach(() => {
    prisma = {
      attribute: mockModel(),
      attributeValue: mockModel(),
      product: mockModel(),
      productVariant: mockModel(),
      productAttributeValue: mockModel(),
      variantAttributeValue: mockModel(),
      $transaction: jest.fn((arg: unknown, tx?: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(tx ?? prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    service = new AttributesService(prisma as unknown as PrismaService);
  });

  describe('upsertAttribute', () => {
    it('creates a new definition with defaults', async () => {
      prisma.attribute.findUnique.mockResolvedValue(null);
      prisma.attribute.create.mockResolvedValue({ id: 'attr-1' });

      await service.upsertAttribute({
        name: 'رنگ',
        slug: 'color',
        type: AttributeType.VARIANT_OPTION,
      });

      expect(prisma.attribute.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'رنگ',
            slug: 'color',
            type: AttributeType.VARIANT_OPTION,
            isFilterable: false,
            isGlobal: false,
          }),
        }),
      );
    });

    it('rejects blank names and non-kebab slugs with 400', async () => {
      await expect(
        service.upsertAttribute({
          name: '   ',
          slug: 'color',
          type: AttributeType.SPEC,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.upsertAttribute({
          name: 'رنگ',
          slug: 'رنگ نامعتبر',
          type: AttributeType.SPEC,
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(prisma.attribute.create).not.toHaveBeenCalled();
    });

    it('returns the existing definition and rejects type reuse with 409', async () => {
      prisma.attribute.findUnique.mockResolvedValue({
        id: 'attr-1',
        type: AttributeType.SPEC,
      });

      await expect(
        service.upsertAttribute({
          name: 'رنگ',
          slug: 'color',
          type: AttributeType.VARIANT_OPTION,
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('maps slug races to 409', async () => {
      prisma.attribute.findUnique.mockResolvedValue(null);
      prisma.attribute.create.mockRejectedValue(p2002('Attribute'));

      await expect(
        service.upsertAttribute({
          name: 'رنگ',
          slug: 'color',
          type: AttributeType.SPEC,
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('assignSpec', () => {
    it('throws 404 for a missing or deleted product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(
        service.assignSpec('prod-1', {
          attributeName: 'ظرفیت',
          attributeSlug: 'capacity',
          value: '1 ترابایت',
          valueSlug: '1tb',
          source: 'WOO_CUSTOM',
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('maps duplicate assignments to 409 (importer skip signal)', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        status: ProductStatus.DRAFT,
        deletedAt: null,
      });
      prisma.attribute.findUnique.mockResolvedValue(null);
      prisma.attribute.create.mockResolvedValue({ id: 'attr-1' });
      prisma.attributeValue.findUnique.mockResolvedValue(null);
      prisma.attributeValue.create.mockResolvedValue({ id: 'val-1' });
      prisma.productAttributeValue.create.mockRejectedValue(
        p2002('ProductAttributeValue'),
      );

      await expect(
        service.assignSpec('prod-1', {
          attributeName: 'ظرفیت',
          attributeSlug: 'capacity',
          value: '1 ترابایت',
          valueSlug: '1tb',
          source: 'WOO_CUSTOM',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('setVariantOption', () => {
    function liveVariant() {
      return {
        id: 'var-1',
        deletedAt: null,
        product: { deletedAt: null, status: ProductStatus.DRAFT },
      };
    }

    it('is a no-op when the same value is already set', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(liveVariant());
      prisma.attribute.findUnique.mockResolvedValue({
        id: 'attr-1',
        type: AttributeType.VARIANT_OPTION,
      });
      prisma.attribute.update.mockResolvedValue({ id: 'attr-1' });
      prisma.attributeValue.findUnique.mockResolvedValue({ id: 'val-1' });
      prisma.variantAttributeValue.findMany.mockResolvedValue([
        { id: 'row-1', attributeValueId: 'val-1' },
      ]);

      const result = await service.setVariantOption('var-1', {
        attributeName: 'رنگ',
        attributeSlug: 'color',
        value: 'مشکی',
        valueSlug: 'black',
      });

      expect(result).toEqual({ id: 'row-1', attributeValueId: 'val-1' });
      expect(
        prisma.variantAttributeValue.deleteMany,
      ).not.toHaveBeenCalled();
      expect(prisma.variantAttributeValue.create).not.toHaveBeenCalled();
    });

    it('replaces sibling values of the same attribute', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(liveVariant());
      prisma.attribute.findUnique.mockResolvedValue({
        id: 'attr-1',
        type: AttributeType.VARIANT_OPTION,
      });
      prisma.attribute.update.mockResolvedValue({ id: 'attr-1' });
      prisma.attributeValue.findUnique.mockResolvedValue({ id: 'val-new' });
      prisma.variantAttributeValue.findMany.mockResolvedValue([
        { id: 'row-old', attributeValueId: 'val-old' },
      ]);
      prisma.variantAttributeValue.create.mockResolvedValue({ id: 'row-new' });

      await service.setVariantOption('var-1', {
        attributeName: 'رنگ',
        attributeSlug: 'color',
        value: 'مشکی',
        valueSlug: 'black',
      });

      expect(prisma.variantAttributeValue.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['row-old'] } },
      });
      expect(prisma.variantAttributeValue.create).toHaveBeenCalledWith({
        data: { variantId: 'var-1', attributeValueId: 'val-new' },
      });
    });

    it('throws 409 under an archived product', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({
        ...liveVariant(),
        product: { deletedAt: null, status: ProductStatus.ARCHIVED },
      });

      await expect(
        service.setVariantOption('var-1', {
          attributeName: 'رنگ',
          attributeSlug: 'color',
          value: 'مشکی',
          valueSlug: 'black',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('deletes', () => {
    it('refuses attributes with values and values in use', async () => {
      prisma.attributeValue.count.mockResolvedValue(2);
      await expect(service.deleteAttribute('attr-1')).rejects.toMatchObject({
        status: 409,
      });

      prisma.productAttributeValue.count.mockResolvedValue(1);
      prisma.variantAttributeValue.count.mockResolvedValue(0);
      await expect(
        service.deleteAttributeValue('val-1'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('throws 404 when nothing was deleted', async () => {
      prisma.attributeValue.count.mockResolvedValue(0);
      prisma.attribute.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.deleteAttribute('nope')).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
