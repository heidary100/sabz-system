import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { mkdtemp, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MediaService } from './media.service';
import { MediaNotFoundError } from './storage/product-media-storage';
import { UploadMediaDto } from './dto';
import type { PrismaService } from '../../common/database/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { ProductMediaStorage } from './storage/product-media-storage';
import type { MediaProcessingService } from './media-processing/media-processing.service';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const MP4_BYTES = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);

async function makeFile(
  buffer: Buffer,
  mimetype: string,
  originalname = 'photo.jpg',
): Promise<Express.Multer.File> {
  const dir = await mkdtemp(join(tmpdir(), 'sabz-media-'));
  const path = join(dir, 'upload');
  await writeFile(path, buffer);
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer: undefined as never,
    stream: undefined as never,
    destination: dir,
    filename: 'upload',
    path,
  } as Express.Multer.File;
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
    putFile: jest.Mock;
    get: jest.Mock;
    getStream: jest.Mock;
    delete: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let processing: { process: jest.Mock };
  let tempDir: string;
  let createdTempPaths: string[] = [];

  const actorId = '11111111-1111-4111-8111-111111111111';
  const productId = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sabz-media-tmp-'));
    createdTempPaths = [];
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
    storage = {
      put: jest.fn(),
      putFile: jest.fn(),
      get: jest.fn(),
      getStream: jest.fn(),
      delete: jest.fn(),
    };
    audit = { log: jest.fn() };
    processing = {
      // Default: identity processing (watermark disabled/absent) so the
      // service-level behavior is exercised independently of the processors.
      process: jest.fn(async (inputPath: string) => {
        const info = await stat(inputPath);
        return { outputPath: inputPath, sizeBytes: info.size };
      }),
    };
    service = new MediaService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      storage as unknown as ProductMediaStorage,
      processing as unknown as MediaProcessingService,
      tempDir,
    );
  });

  afterEach(async () => {
    for (const dir of createdTempPaths) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  describe('upload', () => {
    it('rejects a MIME/magic mismatch with 400', async () => {
      const file = await makeFile(JPEG_BYTES, 'image/png');
      createdTempPaths.push(file.destination);
      await expect(
        service.upload(productId, file, {}, actorId),
      ).rejects.toMatchObject({ status: 400 });
      expect(storage.putFile).not.toHaveBeenCalled();
    });

    it('removes the multer temp file even when validation fails', async () => {
      const file = await makeFile(JPEG_BYTES, 'image/png');
      createdTempPaths.push(file.destination);
      await expect(
        service.upload(productId, file, {}, actorId),
      ).rejects.toMatchObject({ status: 400 });
      await expect(stat(file.path)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('rejects an unsupported format before any storage write', async () => {
      const file = await makeFile(Buffer.from('pdf'), 'application/pdf');
      createdTempPaths.push(file.destination);
      await expect(service.upload(productId, file, {}, actorId)).rejects.toThrow();
      expect(storage.putFile).not.toHaveBeenCalled();
    });

    it('rejects an empty file', async () => {
      const file = await makeFile(Buffer.alloc(0), 'image/png');
      createdTempPaths.push(file.destination);
      await expect(
        service.upload(productId, file, {}, actorId),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('watermarks/processes the temp file, then stores the processed output', async () => {
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
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      const processedPath = join(tempDir, 'processed.jpg');
      await writeFile(processedPath, JPEG_BYTES);
      processing.process.mockResolvedValue({ outputPath: processedPath, sizeBytes: 16 });

      const file = await makeFile(JPEG_BYTES, 'image/jpeg');
      createdTempPaths.push(file.destination);
      const result = await service.upload(productId, file, {}, actorId);

      expect(processing.process).toHaveBeenCalledTimes(1);
      expect(processing.process.mock.calls[0][0]).toBe(file.path);
      expect(processing.process.mock.calls[0][1]).toBe('image/jpeg');
      expect(storage.putFile).toHaveBeenCalledTimes(1);
      const [key, source] = storage.putFile.mock.calls[0] as [string, string];
      expect(key).toMatch(new RegExp(`^products/${productId}/[0-9a-f-]{36}\\.jpg$`));
      expect(source).toBe(processedPath);
      // sizeBytes reflects the processed asset, not the upload
      expect(prisma.productMedia.create.mock.calls[0][0].data.sizeBytes).toBe(16);
      expect(result.isPrimary).toBe(true);
      expect(result.sortOrder).toBe(0);
      // never expose storageKey
      expect(JSON.stringify(result)).not.toContain('storageKey');
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

      const file = await makeFile(JPEG_BYTES, 'image/jpeg');
      createdTempPaths.push(file.destination);
      const result = await service.upload(productId, file, {}, actorId);
      expect(result.isPrimary).toBe(false);
      expect(result.sortOrder).toBe(1);
    });

    it('rejects isPrimary:false on the first image so a primary always exists', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.productMedia.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prisma.productMedia.findFirst.mockResolvedValue(null); // no existing primary
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));

      const file = await makeFile(JPEG_BYTES, 'image/jpeg');
      createdTempPaths.push(file.destination);
      await expect(
        service.upload(
          productId,
          file,
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

      const file = await makeFile(MP4_BYTES, 'video/mp4', 'video.mp4');
      createdTempPaths.push(file.destination);
      const result = await service.upload(productId, file, {}, actorId);
      expect(result.mediaType).toBe('VIDEO');
      expect(result.isPrimary).toBe(false);
    });

    it('rejects a declared mediaType that contradicts detected content', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));

      const file = await makeFile(JPEG_BYTES, 'image/jpeg');
      createdTempPaths.push(file.destination);
      await expect(
        service.upload(
          productId,
          file,
          { mediaType: 'VIDEO' } as UploadMediaDto,
          actorId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('returns 404 when the product is soft-deleted', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: new Date() }]);
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      const file = await makeFile(JPEG_BYTES, 'image/jpeg');
      createdTempPaths.push(file.destination);
      await expect(
        service.upload(productId, file, {}, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 409 when the product is archived', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: ProductStatus.ARCHIVED, deletedAt: null }]);
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      const file = await makeFile(JPEG_BYTES, 'image/jpeg');
      createdTempPaths.push(file.destination);
      await expect(
        service.upload(productId, file, {}, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 404 when a supplied variant does not belong to the product', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.productVariant.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      const file = await makeFile(JPEG_BYTES, 'image/jpeg');
      createdTempPaths.push(file.destination);
      await expect(
        service.upload(
          productId,
          file,
          { variantId: '33333333-3333-4333-8333-333333333333' },
          actorId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cleans up the orphaned binary when the DB transaction fails', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.$transaction.mockRejectedValue(new Error('db failure'));
      const file = await makeFile(JPEG_BYTES, 'image/jpeg');
      createdTempPaths.push(file.destination);
      await expect(
        service.upload(productId, file, {}, actorId),
      ).rejects.toThrow('db failure');
      expect(storage.putFile).toHaveBeenCalledTimes(1);
      expect(storage.delete).toHaveBeenCalledTimes(1);
    });

    it('cleans up temp files (input and processed output) after upload', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: productId, status: 'DRAFT', deletedAt: null }]);
      prisma.productMedia.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prisma.productMedia.findFirst.mockResolvedValue(null);
      prisma.productMedia.create.mockImplementation(async ({ data }) => ({
        id: 'media-1',
        ...data,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
        createdBy: actorId,
        updatedBy: null,
      }));
      prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
      const processedPath = join(tempDir, 'processed.jpg');
      await writeFile(processedPath, JPEG_BYTES);
      processing.process.mockResolvedValue({ outputPath: processedPath, sizeBytes: 16 });

      const file = await makeFile(JPEG_BYTES, 'image/jpeg');
      createdTempPaths.push(file.destination);
      await service.upload(productId, file, {}, actorId);

      await expect(stat(file.path)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(stat(processedPath)).rejects.toMatchObject({ code: 'ENOENT' });
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

  describe('getBinaryStream', () => {
    it('streams the media binary', async () => {
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
      storage.getStream.mockResolvedValue({ read: jest.fn() });

      const { stream, summary } = await service.getBinaryStream(productId, 'media-1');
      expect(stream).toBeDefined();
      expect(JSON.stringify(summary)).not.toContain('storageKey');
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
      storage.getStream.mockRejectedValue(new MediaNotFoundError('products/p/m.jpg'));
      await expect(service.getBinaryStream(productId, 'media-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
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

      expect(prisma.productMedia.updateMany.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(prisma.productMedia.updateMany.mock.calls[1][0].where.id).toBe('media-2');
    });
  });
});