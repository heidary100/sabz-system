import { createHash } from 'crypto';
import { mkdtemp, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProductCondition } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { MediaService } from '../src/modules/products/media.service';
import { LocalDiskMediaStorage } from '../src/modules/products/storage/local-disk-media.storage';

import { StorefrontCacheService } from '../src/common/storefront-cache/storefront-cache.service';
import { ConfigService } from '@nestjs/config';
jest.setTimeout(30_000);

function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
}

/**
 * Media dedup database integration (SS-204).
 *
 * Covers server-computed content hashes, per-product sourceUrl uniqueness,
 * the importer skip-check, and unchanged behavior for sourceless uploads.
 */
describe('Media dedup database integration (SS-204)', () => {
  let prisma: PrismaService;
  let service: MediaService;
  let storageRoot: string;
  let tempDir: string;
  const uploadTempDirs: string[] = [];

  const createdProductIds: string[] = [];
  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMediaIds: string[] = [];
  const actorId = '66666666-6666-4366-8666-666666666666';

  async function file(
    buffer: Buffer,
    originalname = 'photo.jpg',
  ): Promise<Express.Multer.File> {
    const dir = await mkdtemp(join(tmpdir(), 'sabz-media-dedup-'));
    uploadTempDirs.push(dir);
    const path = join(dir, 'upload');
    await writeFile(path, buffer);
    return {
      fieldname: 'file',
      originalname,
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: buffer.length,
      buffer: undefined as never,
      stream: undefined as never,
      destination: dir,
      filename: 'upload',
      path,
    } as Express.Multer.File;
  }

  async function createProduct(): Promise<string> {
    const suffix = `${Date.now()}-${Math.random()}`;
    const brand = await prisma.brand.create({
      data: { name: `برند ${suffix}`, slug: `brand-md-${suffix}` },
    });
    createdBrandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته ${suffix}`, slug: `cat-md-${suffix}` },
    });
    createdCategoryIds.push(category.id);
    const product = await prisma.product.create({
      data: {
        name: `محصول ${suffix}`,
        slug: `prod-md-${suffix}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        createdBy: actorId,
      },
    });
    createdProductIds.push(product.id);
    return product.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    storageRoot = await mkdtemp(join(tmpdir(), 'product-media-dedup-'));
    tempDir = await mkdtemp(join(tmpdir(), 'product-media-dedup-tmp-'));
    const storage = new LocalDiskMediaStorage(storageRoot);
    const audit = new AuditService(prisma);
    const processing = {
      process: async (inputPath: string) => ({
        outputPath: inputPath,
        sizeBytes: (await stat(inputPath)).size,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new MediaService(prisma, audit, storage, processing as any, tempDir, new StorefrontCacheService(new ConfigService()));
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: createdMediaIds } },
    });
    await prisma.productMedia.deleteMany({ where: { id: { in: createdMediaIds } } });
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({
      where: { id: { in: createdCategoryIds } },
    });
    await prisma.$disconnect();
    await rm(storageRoot, { recursive: true, force: true });
    await rm(tempDir, { recursive: true, force: true });
    for (const dir of uploadTempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('stores sourceUrl with the server-computed content hash', async () => {
    const productId = await createProduct();
    const summary = await service.upload(
      productId,
      await file(jpegBuffer()),
      { sourceUrl: 'https://sabzsistem.com/img/1.jpg' },
      actorId,
    );
    createdMediaIds.push(summary.id);

    expect(summary.sourceUrl).toBe('https://sabzsistem.com/img/1.jpg');
    expect(summary.contentHash).toBe(
      createHash('sha256').update(jpegBuffer()).digest('hex'),
    );

    const hit = await service.findBySourceUrl(
      productId,
      'https://sabzsistem.com/img/1.jpg',
    );
    expect(hit?.id).toBe(summary.id);
  });

  it('rejects re-uploading the same sourceUrl for one product', async () => {
    const productId = await createProduct();
    const first = await service.upload(
      productId,
      await file(jpegBuffer()),
      { sourceUrl: 'https://sabzsistem.com/img/2.jpg' },
      actorId,
    );
    createdMediaIds.push(first.id);

    await expect(
      service.upload(
        productId,
        await file(jpegBuffer()),
        { sourceUrl: 'https://sabzsistem.com/img/2.jpg' },
        actorId,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await prisma.productMedia.count({ where: { productId } }),
    ).toBe(1);
  });

  it('keeps sourceless uploads and cross-product reuse deduplicable', async () => {
    const firstId = await createProduct();
    const secondId = await createProduct();

    const one = await service.upload(firstId, await file(jpegBuffer()), {}, actorId);
    const two = await service.upload(firstId, await file(jpegBuffer()), {}, actorId);
    createdMediaIds.push(one.id, two.id);
    expect(one.id).not.toBe(two.id);
    expect(one.contentHash).toBe(two.contentHash);

    // Same origin URL on another product is independent…
    const other = await service.upload(
      secondId,
      await file(jpegBuffer()),
      { sourceUrl: 'https://sabzsistem.com/img/1.jpg' },
      actorId,
    );
    createdMediaIds.push(other.id);

    // …but shares the content hash (reuse signal for the importer report).
    expect(other.contentHash).toBe(one.contentHash);
    expect(
      await prisma.productMedia.count({
        where: { contentHash: one.contentHash, productId: { in: [firstId, secondId] } },
      }),
    ).toBe(3);
  });
});
