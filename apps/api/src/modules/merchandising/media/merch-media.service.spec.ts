import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { PrismaService } from '../../../common/database/prisma.service';
import type { AuditService } from '../../audit/audit.service';
import type { MediaProcessingService } from '../../products/media-processing/media-processing.service';
import type { ProductMediaStorage } from '../../products/storage/product-media-storage';
import { MerchMediaService } from './merch-media.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'media-1',
    originalName: 'hero.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 123,
    storageKey: 'merchandising/media-1.jpg',
    thumbnailKey: 'merchandising/media-1.thumb.webp',
    width: 1200,
    height: 800,
    altFa: null,
    publishedAt: null,
    deletedAt: null,
    createdBy: 'operator-1',
    updatedBy: null,
    createdAt: new Date('2026-11-09T10:00:00.000Z'),
    updatedAt: new Date('2026-11-09T10:00:00.000Z'),
    ...overrides,
  };
}

function file(path: string): Express.Multer.File {
  return {
    path,
    mimetype: 'image/jpeg',
    originalname: 'hero.jpg',
  } as Express.Multer.File;
}

function makeDeps() {
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    merchMedia: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    merchCampaignMedia: { findMany: jest.fn() },
    homepagePublication: { findMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (client: typeof tx) => Promise<unknown>)(tx),
    ),
    merchMedia: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    merchCampaignMedia: { findMany: jest.fn() },
    homepagePublication: { findMany: jest.fn() },
  };
  const storage: jest.Mocked<Pick<ProductMediaStorage, 'putFile' | 'getStream' | 'delete'>> = {
    putFile: jest.fn().mockResolvedValue(undefined),
    getStream: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const processing = {
    process: jest.fn(),
  };
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  return { prisma, tx, storage, processing, audit };
}

function service(deps: ReturnType<typeof makeDeps>, tempDir: string): MerchMediaService {
  return new MerchMediaService(
    deps.prisma as unknown as PrismaService,
    deps.audit as unknown as AuditService,
    deps.storage as unknown as ProductMediaStorage,
    deps.processing as unknown as MediaProcessingService,
    tempDir,
  );
}

describe('MerchMediaService', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'merch-media-service-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('uploads clean campaign media, persists metadata and returns no storage key', async () => {
    const deps = makeDeps();
    const input = join(dir, 'input.jpg');
    const output = join(dir, 'output.jpg');
    const thumb = join(dir, 'thumb.webp');
    await writeFile(input, JPEG);
    await writeFile(output, JPEG);
    await writeFile(thumb, JPEG);
    deps.processing.process.mockResolvedValue({
      outputPath: output,
      sizeBytes: 123,
      width: 1200,
      height: 800,
      thumbnailPath: thumb,
      thumbnailSizeBytes: 45,
    });
    deps.tx.merchMedia.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      row({ ...data }),
    );

    const result = await service(deps, dir).upload(file(input), { altFa: 'تصویر کمپین' }, 'operator-1');

    expect(deps.processing.process).toHaveBeenCalledWith(input, 'image/jpeg', dir, {
      watermark: false,
    });
    expect(deps.storage.putFile).toHaveBeenCalledWith(
      expect.stringMatching(/^merchandising\/.+\.jpg$/),
      output,
    );
    expect(deps.storage.putFile).toHaveBeenCalledWith(
      expect.stringMatching(/^merchandising\/.+\.thumb\.webp$/),
      thumb,
    );
    expect(deps.tx.merchMedia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        altFa: 'تصویر کمپین',
        publishedAt: null,
        width: 1200,
        height: 800,
        thumbnailKey: expect.stringMatching(/^merchandising\/.+\.thumb\.webp$/),
      }),
    });
    expect(deps.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MERCH_MEDIA_UPLOADED' }),
      deps.tx,
    );
    expect(result).not.toHaveProperty('storageKey');
    expect(result.status).toBe('DRAFT');
    expect(result.publishedAt).toBeNull();
  });

  it('rejects an unsupported content type before processing/storage/DB writes', async () => {
    const deps = makeDeps();
    const input = join(dir, 'input.jpg');
    await writeFile(input, Buffer.from('not-an-image'));
    await expect(
      service(deps, dir).upload(file(input), {}, 'operator-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.processing.process).not.toHaveBeenCalled();
    expect(deps.storage.putFile).not.toHaveBeenCalled();
    expect(deps.tx.merchMedia.create).not.toHaveBeenCalled();
  });

  it('rejects oversized images after real size validation', async () => {
    const deps = makeDeps();
    const input = join(dir, 'large.jpg');
    await writeFile(input, JPEG);
    const { truncate } = await import('fs/promises');
    await truncate(input, 10 * 1024 * 1024 + 1);
    await expect(
      service(deps, dir).upload(file(input), {}, 'operator-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.processing.process).not.toHaveBeenCalled();
  });

  it('does not persist metadata when processing fails', async () => {
    const deps = makeDeps();
    const input = join(dir, 'input.jpg');
    await writeFile(input, JPEG);
    deps.processing.process.mockRejectedValue(new BadRequestException('processing failed'));
    await expect(
      service(deps, dir).upload(file(input), {}, 'operator-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.storage.putFile).not.toHaveBeenCalled();
    expect(deps.tx.merchMedia.create).not.toHaveBeenCalled();
  });

  it('removes stored objects when DB persistence fails', async () => {
    const deps = makeDeps();
    const input = join(dir, 'input.jpg');
    const output = join(dir, 'output.jpg');
    const thumb = join(dir, 'thumb.webp');
    await writeFile(input, JPEG);
    await writeFile(output, JPEG);
    await writeFile(thumb, JPEG);
    deps.processing.process.mockResolvedValue({
      outputPath: output,
      sizeBytes: 123,
      width: 1200,
      height: 800,
      thumbnailPath: thumb,
    });
    deps.tx.merchMedia.create.mockRejectedValue(new Error('db failed'));

    await expect(
      service(deps, dir).upload(file(input), {}, 'operator-1'),
    ).rejects.toThrow('db failed');
    expect(deps.storage.delete).toHaveBeenCalledTimes(2);
  });

  it('logs cleanup failures without masking the original error', async () => {
    const deps = makeDeps();
    const input = join(dir, 'input.jpg');
    const output = join(dir, 'output.jpg');
    await writeFile(input, JPEG);
    await writeFile(output, JPEG);
    deps.processing.process.mockResolvedValue({
      outputPath: output,
      sizeBytes: 123,
      width: 1200,
      height: 800,
    });
    deps.tx.merchMedia.create.mockRejectedValue(new Error('db failed'));
    deps.storage.delete.mockRejectedValue(new Error('storage down'));
    const merchService = service(deps, dir);
    const errorSpy = jest.spyOn(
      (merchService as unknown as { logger: { error: (...args: unknown[]) => void } }).logger,
      'error',
    );

    await expect(
      merchService.upload(file(input), {}, 'operator-1'),
    ).rejects.toThrow('db failed');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('lists with pagination, search, publication filter and stable sorting', async () => {
    const deps = makeDeps();
    deps.prisma.merchMedia.count.mockResolvedValue(1);
    deps.prisma.merchMedia.findMany.mockResolvedValue([row()]);
    const result = await service(deps, dir).list({
      page: 2,
      limit: 10,
      q: 'hero',
      isPublished: false,
    });
    expect(deps.prisma.merchMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          publishedAt: null,
          OR: expect.any(Array),
        }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 10,
        take: 10,
      }),
    );
    expect(result.total).toBe(1);
    expect(result.items[0]?.status).toBe('DRAFT');
  });

  it('returns usage detail for campaigns and current/scheduled snapshots', async () => {
    const deps = makeDeps();
    deps.prisma.merchMedia.findFirst.mockResolvedValue(row());
    deps.prisma.merchCampaignMedia.findMany.mockResolvedValue([
      { campaign: { id: 'campaign-1', internalName: 'کمپین', archivedAt: null } },
    ]);
    deps.prisma.homepagePublication.findMany.mockResolvedValue([
      {
        id: 'pub-1',
        version: 3,
        status: 'PUBLISHED',
        sections: [{ settings: { campaigns: [{ media: [{ mediaId: 'media-1' }] }] } }],
      },
      {
        id: 'pub-2',
        version: 4,
        status: 'SCHEDULED',
        sections: [{ settings: { campaigns: [{ media: [{ mediaId: 'media-1' }] }] } }],
      },
    ]);
    const detail = await service(deps, dir).getDetail('media-1');
    expect(detail.usage.campaigns).toHaveLength(1);
    expect(detail.usage.currentPublications.map((p) => p.version)).toEqual([3]);
    expect(detail.usage.scheduledPublications.map((p) => p.version)).toEqual([4]);
  });

  it('updates only alt text and rejects server-controlled fields', async () => {
    const deps = makeDeps();
    deps.tx.merchMedia.findFirst.mockResolvedValue(row({ altFa: 'قدیمی' }));
    deps.tx.merchMedia.update.mockResolvedValue(row({ altFa: 'جدید' }));

    await expect(
      service(deps, dir).update('media-1', { storageKey: 'x' }, 'operator-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    const updated = await service(deps, dir).update(
      'media-1',
      { altFa: ' جدید ' },
      'operator-1',
    );
    expect(updated.altFa).toBe('جدید');
    expect(deps.tx.$executeRawUnsafe).toHaveBeenCalled();
    expect(deps.tx.merchMedia.update).toHaveBeenCalledWith({
      where: { id: 'media-1' },
      data: { altFa: 'جدید', updatedBy: 'operator-1' },
    });
  });

  it('rejects a metadata edit when the media was deleted before the lock', async () => {
    const deps = makeDeps();
    deps.tx.merchMedia.findFirst.mockResolvedValue(null);

    await expect(
      service(deps, dir).update('media-1', { altFa: 'new' }, 'operator-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deps.tx.merchMedia.update).not.toHaveBeenCalled();
  });

  it('rejects malformed update bodies without mutating media', async () => {
    const deps = makeDeps();
    deps.tx.merchMedia.findFirst.mockResolvedValue(row());

    for (const body of [null, [], 'altFa', 42, true]) {
      await expect(
        service(deps, dir).update('media-1', body, 'operator-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    expect(deps.tx.merchMedia.update).not.toHaveBeenCalled();
  });

  it('blocks deletion for campaign references and live/scheduled publication snapshots', async () => {
    const deps = makeDeps();
    deps.tx.merchMedia.findFirst.mockResolvedValue(row());
    deps.tx.merchCampaignMedia.findMany.mockResolvedValue([{ campaign: { id: 'campaign-1' } }]);
    await expect(
      service(deps, dir).remove('media-1', 'operator-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    deps.tx.merchCampaignMedia.findMany.mockResolvedValue([]);
    deps.tx.homepagePublication.findMany.mockResolvedValue([
      {
        id: 'pub-1',
        version: 7,
        status: 'PUBLISHED',
        sections: [{ media: [{ mediaId: 'media-1' }] }],
      },
    ]);
    await expect(
      service(deps, dir).remove('media-1', 'operator-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(deps.tx.merchMedia.update).not.toHaveBeenCalled();
  });

  it('soft-deletes unreferenced media without removing the binary', async () => {
    const deps = makeDeps();
    deps.tx.merchMedia.findFirst.mockResolvedValue(row());
    deps.tx.merchCampaignMedia.findMany.mockResolvedValue([]);
    deps.tx.homepagePublication.findMany.mockResolvedValue([]);
    deps.tx.merchMedia.update.mockResolvedValue(row({ deletedAt: new Date() }));

    const result = await service(deps, dir).remove('media-1', 'operator-1');
    expect(result.id).toBe('media-1');
    expect(deps.tx.$executeRawUnsafe).toHaveBeenCalled();
    expect(deps.storage.delete).not.toHaveBeenCalled();
  });

  it('serves public streams only when publishedAt is set', async () => {
    const deps = makeDeps();
    deps.prisma.merchMedia.findFirst.mockResolvedValueOnce(null);
    await expect(
      service(deps, dir).getPublicStream('media-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    deps.prisma.merchMedia.findFirst.mockResolvedValueOnce({
      storageKey: 'merchandising/media-1.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 123,
    });
    deps.storage.getStream.mockResolvedValue({} as never);
    const publicResult = await service(deps, dir).getPublicStream('media-1');
    expect(publicResult.mimeType).toBe('image/jpeg');
  });
});
