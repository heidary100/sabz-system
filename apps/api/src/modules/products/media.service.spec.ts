import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { MediaService } from './media.service';
import { MediaNotFoundError } from './storage/product-media-storage';
import { UploadMediaDto } from './dto';

function jpegFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'photo.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 4,
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function mp4File(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'video.mp4',
    encoding: '7bit',
    mimetype: 'video/mp4',
    size: 8,
    buffer: Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

describe('MediaService (SS-105)', () => {
  let service: MediaService;
  let prisma: {
    product: { findUnique: jest.Mock; findFirst: jest.Mock };
    productVariant: { findFirst: jest.Mock };
    productMedia: {
      aggregate: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let storage: {
    put: jest.Mock;
    get: jest.Mock;
    delete: jest.Mock;
  };
  let audit: { log: jest.Mock };

  const actorId = '11111111-1111-4111-8111-111111111111';
  const productId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn(), findFirst: jest.fn() },
      productVariant: { findFirst: jest.fn() },
      productMedia: {
        aggregate: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };
    storage = { put: jest.fn(), get: jest.fn(), delete: jest.fn() };
    audit = { log: jest.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new MediaService(prisma as any, audit as any, storage as any);
  });

  describe('upload', () => {
    it('rejects a MIME/magic mismatch with 400', async () => {
      await expect(
        service.upload(productId, jpegFile({ mimetype: 'image/png' }), {}, actorId),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('rejects an unsupported format before any storage write', async () => {
      const file = jpegFile({ mimetype: 'application/pdf', buffer: Buffer.from('pdf') });
      await expect(service.upload(productId, file, {}, actorId)).rejects.toThrow();
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('writes binary first, then creates metadata in a transaction', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.productMedia.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prisma.productMedia.findFirst.mockResolvedValue(null); // no existing primary
      prisma.productMedia.create.mockImplementation(async ({ data }) => ({
        id: 'media-1',
        ...data,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
        createdBy: actorId,
        updatedBy: null,
      }));
      // execute the transaction callback
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));

      const result = await service.upload(productId, jpegFile(), {}, actorId);

      expect(storage.put).toHaveBeenCalledTimes(1);
      const key = storage.put.mock.calls[0][0] as string;
      expect(key).toMatch(new RegExp(`^products/${productId}/[0-9a-f-]{36}\\.jpg$`));
      expect(prisma.productMedia.create).toHaveBeenCalledTimes(1);
      expect(result.isPrimary).toBe(true);
      expect(result.sortOrder).toBe(0);
      // never expose storageKey
      expect(JSON.stringify(result)).not.toContain('storageKey');
      // audit payload is safe
      expect(JSON.stringify(audit.log.mock.calls[0][0].after)).not.toContain('storageKey');
    });

    it('does not make a second image primary', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.productMedia.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      prisma.productMedia.findFirst.mockResolvedValue({ id: 'existing-primary' }); // already primary
      prisma.productMedia.create.mockImplementation(async ({ data }) => ({
        id: 'media-2',
        ...data,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
        createdBy: actorId,
        updatedBy: null,
      }));
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));

      const result = await service.upload(productId, jpegFile(), {}, actorId);
      expect(result.isPrimary).toBe(false);
      expect(result.sortOrder).toBe(1);
    });

    it('rejects isPrimary:false on the first image so a primary always exists', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.productMedia.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prisma.productMedia.findFirst.mockResolvedValue(null); // no existing primary
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));

      await expect(
        service.upload(
          productId,
          jpegFile(),
          { isPrimary: false } as UploadMediaDto,
          actorId,
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.productMedia.create).not.toHaveBeenCalled();
    });

    it('never makes a video primary', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.productMedia.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prisma.productMedia.findFirst.mockResolvedValue(null);
      prisma.productMedia.create.mockImplementation(async ({ data }) => ({
        id: 'media-v',
        ...data,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
        createdBy: actorId,
        updatedBy: null,
      }));
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));

      const result = await service.upload(productId, mp4File(), {}, actorId);
      expect(result.mediaType).toBe('VIDEO');
      expect(result.isPrimary).toBe(false);
    });

    it('rejects a declared mediaType that contradicts detected content', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      await expect(
        service.upload(
          productId,
          jpegFile(),
          { mediaType: 'VIDEO' } as UploadMediaDto,
          actorId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('returns 404 when the product is soft-deleted', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: new Date() }]);
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      await expect(
        service.upload(productId, jpegFile(), {}, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 409 when the product is archived', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: ProductStatus.ARCHIVED, deletedAt: null }]);
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      await expect(
        service.upload(productId, jpegFile(), {}, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 404 when a supplied variant does not belong to the product', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.productVariant.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      await expect(
        service.upload(
          productId,
          jpegFile(),
          { variantId: '33333333-3333-4333-8333-333333333333' },
          actorId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cleans up the orphaned binary when the DB transaction fails', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.$transaction.mockRejectedValue(new Error('db failure'));
      await expect(
        service.upload(productId, jpegFile(), {}, actorId),
      ).rejects.toThrow('db failure');
      expect(storage.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBinary', () => {
    it('returns 404 for a missing/soft-deleted media', async () => {
      prisma.productMedia.findFirst.mockResolvedValue(null);
      await expect(service.getBinary(productId, 'media-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('maps a missing binary to 404', async () => {
      prisma.productMedia.findFirst.mockResolvedValue({
        id: 'media-1',
        productId,
        variantId: null,
        mediaType: 'IMAGE',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 4,
        sortOrder: 0,
        isPrimary: true,
        storageKey: 'products/p/m.jpg',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
        createdBy: null,
        updatedBy: null,
      });
      storage.get.mockRejectedValue(new MediaNotFoundError('products/p/m.jpg'));
      await expect(service.getBinary(productId, 'media-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the buffer and a safe summary for an existing media', async () => {
      prisma.productMedia.findFirst.mockResolvedValue({
        id: 'media-1',
        productId,
        variantId: null,
        mediaType: 'IMAGE',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 4,
        sortOrder: 0,
        isPrimary: true,
        storageKey: 'products/p/m.jpg',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
        createdBy: null,
        updatedBy: null,
      });
      storage.get.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]));

      const { buffer, summary } = await service.getBinary(productId, 'media-1');
      expect(buffer).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      expect(JSON.stringify(summary)).not.toContain('storageKey');
      expect(JSON.stringify(summary)).not.toContain('deletedAt');
    });
  });

  describe('remove', () => {
    it('returns 404 for a missing media', async () => {
      prisma.productMedia.findFirst.mockResolvedValue(null);
      await expect(service.remove('media-1', actorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('soft-deletes metadata, removes binary post-commit, and audits', async () => {
      prisma.productMedia.findFirst
        .mockResolvedValueOnce({
          id: 'media-1',
          productId,
          variantId: null,
          mediaType: 'IMAGE',
          originalName: 'photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 4,
          sortOrder: 0,
          isPrimary: true,
          storageKey: 'products/p/m.jpg',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          deletedAt: null,
          createdBy: null,
          updatedBy: null,
        }) // initial target
        .mockResolvedValueOnce({ isPrimary: true, mediaType: 'IMAGE' }) // in-lock re-read
        .mockResolvedValueOnce(null); // no next image to promote
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.productMedia.updateMany.mockResolvedValue({ count: 1 });
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      storage.delete.mockResolvedValue(undefined);

      await service.remove('media-1', actorId);

      expect(prisma.productMedia.updateMany).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log.mock.calls[0][0].action).toBe('PRODUCT_MEDIA_REMOVED');
      expect(JSON.stringify(audit.log.mock.calls[0][0].after)).not.toContain('storageKey');
      expect(storage.delete).toHaveBeenCalledWith('products/p/m.jpg');
    });

    it('promotes the next image when deleting the primary', async () => {
      prisma.productMedia.findFirst
        .mockResolvedValueOnce({
          id: 'media-1',
          productId,
          variantId: null,
          mediaType: 'IMAGE',
          originalName: 'photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 4,
          sortOrder: 0,
          isPrimary: true,
          storageKey: 'products/p/m.jpg',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          deletedAt: null,
          createdBy: null,
          updatedBy: null,
        }) // initial target
        .mockResolvedValueOnce({ isPrimary: true, mediaType: 'IMAGE' }) // in-lock re-read
        .mockResolvedValueOnce({ id: 'media-2' }); // next image
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.productMedia.updateMany.mockResolvedValue({ count: 1 });
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      storage.delete.mockResolvedValue(undefined);

      await service.remove('media-1', actorId);
      expect(prisma.productMedia.updateMany).toHaveBeenCalled();
    });

    it('logs (not throws) when post-commit binary removal fails', async () => {
      prisma.productMedia.findFirst
        .mockResolvedValueOnce({
          id: 'media-1',
          productId,
          variantId: null,
          mediaType: 'IMAGE',
          originalName: 'photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 4,
          sortOrder: 0,
          isPrimary: false,
          storageKey: 'products/p/m.jpg',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          deletedAt: null,
          createdBy: null,
          updatedBy: null,
        }) // initial target
        .mockResolvedValueOnce({ isPrimary: false, mediaType: 'IMAGE' }); // in-lock re-read (no promote)
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.productMedia.updateMany.mockResolvedValue({ count: 1 });
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      storage.delete.mockRejectedValue(new Error('io error'));

      await expect(service.remove('media-1', actorId)).resolves.toBeUndefined();
    });

    it('promotes based on the in-lock primary state, not the stale pre-lock snapshot', async () => {
      // A concurrent delete promoted this media to primary between the
      // pre-lock read (isPrimary: false) and the in-lock re-read (isPrimary:
      // true). Promotion must still happen so exactly one primary remains.
      prisma.productMedia.findFirst
        .mockResolvedValueOnce({
          id: 'media-1',
          productId,
          variantId: null,
          mediaType: 'IMAGE',
          originalName: 'photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 4,
          sortOrder: 0,
          isPrimary: false, // stale pre-lock snapshot
          storageKey: 'products/p/m.jpg',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          deletedAt: null,
          createdBy: null,
          updatedBy: null,
        })
        .mockResolvedValueOnce({ isPrimary: true, mediaType: 'IMAGE' }) // in-lock re-read
        .mockResolvedValueOnce({ id: 'media-2' }); // next image to promote
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.productMedia.updateMany.mockResolvedValue({ count: 1 });
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      storage.delete.mockResolvedValue(undefined);

      await service.remove('media-1', actorId);

      // updateMany is called for the soft-delete and for the promote
      expect(prisma.productMedia.updateMany.mock.calls.length).toBeGreaterThanOrEqual(2);
      // the promotion update targets the next image
      expect(prisma.productMedia.updateMany.mock.calls[1][0].where.id).toBe('media-2');
    });
  });
});
