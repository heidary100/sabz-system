import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { mkdtemp, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DescriptionImageService } from './description-image.service';
import type { PrismaService } from '../../common/database/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { ProductMediaStorage } from './storage/product-media-storage';
import type { MediaProcessingService } from './media-processing/media-processing.service';
import { downloadImageToTemp } from './secure-image-import';

jest.mock('./secure-image-import');
const mockDownloadImageToTemp = downloadImageToTemp as jest.MockedFunction<
  typeof downloadImageToTemp
>;

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

async function makeFile(
  buffer: Buffer,
  mimetype: string,
  originalname = 'photo.jpg',
): Promise<Express.Multer.File> {
  const dir = await mkdtemp(join(tmpdir(), 'sabz-desc-img-'));
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

describe('DescriptionImageService (rich-text description images)', () => {
  let service: DescriptionImageService;
  let prisma: { product: { findUnique: jest.Mock } };
  let storage: { putFile: jest.Mock; getStream: jest.Mock; delete: jest.Mock };
  let audit: { log: jest.Mock };
  let processing: { process: jest.Mock };
  let tempDir: string;
  let uploadTempDirs: string[] = [];

  const actorId = '11111111-1111-4111-8111-111111111111';
  const productId = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sabz-desc-img-tmp-'));
    prisma = { product: { findUnique: jest.fn() } };
    storage = { putFile: jest.fn(), getStream: jest.fn(), delete: jest.fn() };
    audit = { log: jest.fn() };
    // Default: identity processing (watermark disabled/absent) so the
    // service-level behavior is exercised independently of the processors.
    processing = {
      process: jest.fn(async (inputPath: string) => {
        const info = await stat(inputPath);
        return { outputPath: inputPath, sizeBytes: info.size };
      }),
    };
    uploadTempDirs = [];
    mockDownloadImageToTemp.mockReset();
    service = new DescriptionImageService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      storage as unknown as ProductMediaStorage,
      processing as unknown as MediaProcessingService,
      tempDir,
    );
  });

  afterEach(async () => {
    for (const dir of uploadTempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('upload', () => {
    it('watermarks, stores the image and returns a relative public URL', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        status: ProductStatus.DRAFT,
        deletedAt: null,
      });
      storage.putFile.mockResolvedValue(undefined);
      audit.log.mockResolvedValue(undefined);

      const file = await makeFile(JPEG_BYTES, 'image/jpeg');
      uploadTempDirs.push(file.destination);
      const result = await service.upload(productId, file, actorId);

      expect(processing.process).toHaveBeenCalledTimes(1);
      expect(processing.process.mock.calls[0][0]).toBe(file.path);
      expect(processing.process.mock.calls[0][1]).toBe('image/jpeg');
      expect(storage.putFile).toHaveBeenCalledTimes(1);
      const [key, source] = storage.putFile.mock.calls[0] as [string, string];
      expect(key).toMatch(/^descriptions\/[0-9a-f-]{36}\.jpg$/);
      expect(source).toBe(file.path);
      expect(result.url).toMatch(/^\/api\/v1\/description-images\/[0-9a-f-]{36}\.jpg$/);
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log.mock.calls[0][0].action).toBe(
        'PRODUCT_DESCRIPTION_IMAGE_UPLOADED',
      );
      // temp upload removed
      await expect(stat(file.path)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('rejects a non-image file', async () => {
      const file = await makeFile(Buffer.from('not an image'), 'image/jpeg');
      uploadTempDirs.push(file.destination);
      await expect(service.upload(productId, file, actorId)).rejects.toMatchObject({
        status: 400,
      });
      expect(storage.putFile).not.toHaveBeenCalled();
    });

    it('rejects a video file', async () => {
      const file = await makeFile(
        Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
        'video/mp4',
      );
      uploadTempDirs.push(file.destination);
      await expect(service.upload(productId, file, actorId)).rejects.toMatchObject({
        status: 400,
      });
      expect(storage.putFile).not.toHaveBeenCalled();
    });

    it('rejects an oversized image with a 5 MB message', async () => {
      const file = await makeFile(
        Buffer.concat([JPEG_BYTES, Buffer.alloc(5 * 1024 * 1024)]),
        'image/jpeg',
      );
      uploadTempDirs.push(file.destination);
      try {
        await service.upload(productId, file, actorId);
        throw new Error('expected to throw');
      } catch (error) {
        expect(error).toMatchObject({ status: 400 });
        expect((error as Error).message).toBe(
          'حجم تصویر باید حداکثر ۵ مگابایت باشد.',
        );
      }
    });

    it('rejects uploading to a soft-deleted product (404)', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        status: ProductStatus.DRAFT,
        deletedAt: new Date(),
      });
      const file = await makeFile(JPEG_BYTES, 'image/jpeg');
      uploadTempDirs.push(file.destination);
      await expect(service.upload(productId, file, actorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storage.putFile).not.toHaveBeenCalled();
    });

    it('rejects uploading to an archived product (409)', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        status: ProductStatus.ARCHIVED,
        deletedAt: null,
      });
      const file = await makeFile(JPEG_BYTES, 'image/jpeg');
      uploadTempDirs.push(file.destination);
      await expect(service.upload(productId, file, actorId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(storage.putFile).not.toHaveBeenCalled();
    });

    it('cleans up the stored binary when the audit write fails', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        status: ProductStatus.DRAFT,
        deletedAt: null,
      });
      storage.putFile.mockResolvedValue(undefined);
      audit.log.mockRejectedValue(new Error('audit db down'));
      const file = await makeFile(JPEG_BYTES, 'image/jpeg');
      uploadTempDirs.push(file.destination);
      await expect(service.upload(productId, file, actorId)).rejects.toThrow(
        'audit db down',
      );
      expect(storage.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('importFromUrl', () => {
    it('imports, watermarks, stores and audits a remote image', async () => {
      const importDir = await mkdtemp(join(tmpdir(), 'sabz-desc-import-'));
      const filePath = join(importDir, 'img-0.bin');
      await writeFile(filePath, JPEG_BYTES);
      mockDownloadImageToTemp.mockResolvedValue({ filePath, dir: importDir });
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        status: ProductStatus.DRAFT,
        deletedAt: null,
      });
      storage.putFile.mockResolvedValue(undefined);
      audit.log.mockResolvedValue(undefined);

      const result = await service.importFromUrl(
        productId,
        'https://cdn.example.com/photo.jpg',
        actorId,
      );

      expect(mockDownloadImageToTemp).toHaveBeenCalledTimes(1);
      expect(processing.process).toHaveBeenCalledTimes(1);
      expect(storage.putFile).toHaveBeenCalledTimes(1);
      expect(result.url).toMatch(
        /^\/api\/v1\/description-images\/[0-9a-f-]{36}\.jpg$/,
      );
      expect(audit.log.mock.calls[0][0].action).toBe(
        'PRODUCT_DESCRIPTION_IMAGE_IMPORTED',
      );
      await rm(importDir, { recursive: true, force: true });
    });

    it('rejects imported content that is not a valid image', async () => {
      const importDir = await mkdtemp(join(tmpdir(), 'sabz-desc-import-'));
      const filePath = join(importDir, 'img-0.bin');
      await writeFile(filePath, Buffer.from('not an image at all'));
      mockDownloadImageToTemp.mockResolvedValue({ filePath, dir: importDir });
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        status: ProductStatus.DRAFT,
        deletedAt: null,
      });

      await expect(
        service.importFromUrl(productId, 'https://cdn.example.com/x.txt', actorId),
      ).rejects.toMatchObject({ status: 400 });
      expect(storage.putFile).not.toHaveBeenCalled();
      await rm(importDir, { recursive: true, force: true });
    });

    it('rejects importing to an archived product (409)', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        status: ProductStatus.ARCHIVED,
        deletedAt: null,
      });
      await expect(
        service.importFromUrl(productId, 'https://cdn.example.com/a.jpg', actorId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockDownloadImageToTemp).not.toHaveBeenCalled();
    });
  });

  describe('getPublic', () => {
    it('streams a valid description image', async () => {
      storage.getStream.mockResolvedValue({ read: jest.fn() });
      const result = await service.getPublic(
        '33333333-3333-4333-8333-333333333333.png',
      );
      expect(result.mimeType).toBe('image/png');
      expect(storage.getStream).toHaveBeenCalledWith(
        'descriptions/33333333-3333-4333-8333-333333333333.png',
      );
    });

    it('rejects an invalid file name (404)', async () => {
      await expect(service.getPublic('../../etc/passwd')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.getPublic('garbage.txt')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.getPublic('descriptions/x.jpg')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storage.getStream).not.toHaveBeenCalled();
    });

    it('maps a missing stored image to 404', async () => {
      const { MediaNotFoundError } = await import('./storage/product-media-storage');
      storage.getStream.mockRejectedValue(
        new MediaNotFoundError('descriptions/missing.jpg'),
      );
      await expect(
        service.getPublic('44444444-4444-4444-8444-444444444444.jpg'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});