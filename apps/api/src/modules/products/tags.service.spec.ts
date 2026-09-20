import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { TagsService } from './tags.service';

function p2002(model: string) {
  return Object.assign(
    new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    }),
    { meta: { modelName: model } },
  );
}

describe('TagsService (SS-203)', () => {
  interface ModelMock {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    deleteMany: jest.Mock;
    count: jest.Mock;
  }

  let service: TagsService;
  let prisma: {
    tag: ModelMock;
    product: ModelMock;
    productTag: ModelMock;
  };

  function mockModel(): ModelMock {
    return {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    };
  }

  beforeEach(() => {
    prisma = {
      tag: mockModel(),
      product: mockModel(),
      productTag: mockModel(),
    };
    service = new TagsService(prisma as unknown as PrismaService);
  });

  describe('upsertTag', () => {
    it('creates a tag from raw input', async () => {
      prisma.tag.findUnique.mockResolvedValue(null);
      prisma.tag.create.mockResolvedValue({ id: 'tag-1' });

      await service.upsertTag('لپ تاپ', 'laptop');

      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'لپ تاپ',
            key: 'لپتاپ',
            slug: 'laptop',
          }),
        }),
      );
    });

    it('returns the existing row for spelling variants (key identity)', async () => {
      prisma.tag.findUnique.mockResolvedValue({
        id: 'tag-1',
        name: 'لپ تاپ',
        slug: 'laptop',
      });

      const result = await service.upsertTag('لپتاپ', 'laptop-alt');

      expect(result.id).toBe('tag-1');
      expect(prisma.tag.create).not.toHaveBeenCalled();
    });

    it('rejects blank names and non-kebab slugs with 400', async () => {
      await expect(service.upsertTag('   ', 'x')).rejects.toMatchObject({
        status: 400,
      });
      await expect(service.upsertTag('نامعتبر', 'نامعتبر')).rejects.toMatchObject({
        status: 400,
      });
      expect(prisma.tag.create).not.toHaveBeenCalled();
    });

    it('maps slug races to 409', async () => {
      prisma.tag.findUnique.mockResolvedValue(null);
      prisma.tag.create.mockRejectedValue(p2002('Tag'));

      await expect(service.upsertTag('تازه', 'dupe')).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  describe('assignTag', () => {
    it('throws 404 for a missing product and 409 on duplicates', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(
        service.assignTag('prod-1', 'تگ', 'tag', 0),
      ).rejects.toMatchObject({ status: 404 });

      prisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        status: ProductStatus.DRAFT,
        deletedAt: null,
      });
      prisma.tag.findUnique.mockResolvedValue({ id: 'tag-1' });
      prisma.productTag.create.mockRejectedValue(p2002('ProductTag'));
      await expect(
        service.assignTag('prod-1', 'تگ', 'tag', 0),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('deleteTag', () => {
    it('refuses tags in use and reports missing rows', async () => {
      prisma.productTag.count.mockResolvedValue(3);
      await expect(service.deleteTag('tag-1')).rejects.toMatchObject({
        status: 409,
      });

      prisma.productTag.count.mockResolvedValue(0);
      prisma.tag.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.deleteTag('nope')).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
