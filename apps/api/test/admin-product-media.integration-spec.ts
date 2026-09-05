import { mkdtemp, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProductCondition } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { MediaService } from '../src/modules/products/media.service';
import { LocalDiskMediaStorage } from '../src/modules/products/storage/local-disk-media.storage';

jest.setTimeout(30_000);

function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
}

function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function mp4Buffer(): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from([0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
  ]);
}

describe('Admin product media database integration (SS-105)', () => {
  let prisma: PrismaService;
  let service: MediaService;
  let storageRoot: string;
  let tempDir: string;
  const uploadTempDirs: string[] = [];

  const createdProductIds: string[] = [];
  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdMediaIds: string[] = [];
  const actorId = '22222222-2222-4222-8222-222222222222';

  async function file(
    mimetype: string,
    buffer: Buffer,
    originalname = 'upload.bin',
  ): Promise<Express.Multer.File> {
    const dir = await mkdtemp(join(tmpdir(), 'sabz-media-int-'));
    uploadTempDirs.push(dir);
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

  async function createBrand(): Promise<string> {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${Date.now()}-${Math.random()}`,
        slug: `brand-${Date.now()}-${Math.random()}`,
      },
    });
    createdBrandIds.push(brand.id);
    return brand.id;
  }

  async function createCategory(): Promise<string> {
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}-${Math.random()}`,
        slug: `cat-${Date.now()}-${Math.random()}`,
      },
    });
    createdCategoryIds.push(category.id);
    return category.id;
  }

  async function createProduct(
    overrides: { deletedAt?: Date | null } = {},
  ): Promise<string> {
    const brandId = await createBrand();
    const categoryId = await createCategory();
    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}-${Math.random()}`,
        slug: `prod-${Date.now()}-${Math.random()}`,
        brandId,
        categoryId,
        condition: ProductCondition.NEW,
        deletedAt: overrides.deletedAt ?? null,
        createdBy: actorId,
      },
    });
    createdProductIds.push(product.id);
    return product.id;
  }

  async function createVariant(productId: string): Promise<string> {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `SKU-${Date.now()}-${Math.random()}`,
        price: '100.00',
        stockQuantity: 0,
        createdBy: actorId,
      },
    });
    createdVariantIds.push(variant.id);
    return variant.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    storageRoot = await mkdtemp(join(tmpdir(), 'product-media-int-'));
    tempDir = await mkdtemp(join(tmpdir(), 'product-media-int-tmp-'));
    const storage = new LocalDiskMediaStorage(storageRoot);
    const audit = new AuditService(prisma);
    // Identity processing keeps the integration suite focused on the DB/storage
    // lifecycle; watermark behavior is covered by the media-processing specs.
    const processing = {
      process: async (inputPath: string) => ({
        outputPath: inputPath,
        sizeBytes: (await stat(inputPath)).size,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new MediaService(prisma, audit, storage, processing as any, tempDir);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: createdMediaIds } },
    });
    await prisma.productMedia.deleteMany({ where: { id: { in: createdMediaIds } } });
    const orphanProducts = await prisma.product.findMany({
      where: {
        OR: [
          { brandId: { in: createdBrandIds } },
          { categoryId: { in: createdCategoryIds } },
        ],
      },
      select: { id: true },
    });
    const orphanIds = orphanProducts.map((row) => row.id);
    const orphanVariantRows = await prisma.productVariant.findMany({
      where: { productId: { in: orphanIds } },
      select: { id: true },
    });
    const variantIds = [
      ...createdVariantIds,
      ...orphanVariantRows.map((row) => row.id),
    ];
    await prisma.inventoryMovement.deleteMany({
      where: { inventoryItem: { variantId: { in: variantIds } } },
    });
    await prisma.reservation.deleteMany({
      where: { inventoryItem: { variantId: { in: variantIds } } },
    });
    await prisma.inventoryItem.deleteMany({
      where: { variantId: { in: variantIds } },
    });
    await prisma.productVariant.deleteMany({ where: { productId: { in: orphanIds } } });
    await prisma.product.deleteMany({ where: { id: { in: orphanIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: createdVariantIds } },
    });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
    await prisma.$disconnect();
    await rm(storageRoot, { recursive: true, force: true });
    await rm(tempDir, { recursive: true, force: true });
    for (const dir of uploadTempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('uploads an image, persists metadata + binary round-trip, and audits', async () => {
    const productId = await createProduct();
    const result = await service.upload(
      productId,
      await file('image/jpeg', jpegBuffer(), 'photo.jpg'),
      {},
      actorId,
    );

    createdMediaIds.push(result.id);
    expect(result.mediaType).toBe('IMAGE');
    expect(result.isPrimary).toBe(true);
    expect(result.originalName).toBe('photo.jpg');
    expect(JSON.stringify(result)).not.toContain('storageKey');
    expect(JSON.stringify(result)).not.toContain('deletedAt');

    const row = await prisma.productMedia.findUnique({ where: { id: result.id } });
    expect(row?.mimeType).toBe('image/jpeg');
    expect(row?.storageKey).toMatch(/^products\/.+\/.*\.jpg$/);

    const { buffer } = await service.getBinary(productId, result.id);
    expect(buffer).toEqual(jpegBuffer());

    const audits = await prisma.auditLog.findMany({
      where: { entityId: result.id, action: 'PRODUCT_MEDIA_UPLOADED' },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]!.after)).not.toContain('storageKey');
  });

  it('makes only the first image primary', async () => {
    const productId = await createProduct();
    const first = await service.upload(
      productId,
      await file('image/png', pngBuffer(), 'a.png'),
      {},
      actorId,
    );
    const second = await service.upload(
      productId,
      await file('image/jpeg', jpegBuffer(), 'b.jpg'),
      {},
      actorId,
    );
    createdMediaIds.push(first.id, second.id);

    expect(first.isPrimary).toBe(true);
    expect(second.isPrimary).toBe(false);
    expect(second.sortOrder).toBeGreaterThan(first.sortOrder);
  });

  it('uploads a video that is never primary', async () => {
    const productId = await createProduct();
    const result = await service.upload(
      productId,
      await file('video/mp4', mp4Buffer(), 'v.mp4'),
      {},
      actorId,
    );
    createdMediaIds.push(result.id);
    expect(result.mediaType).toBe('VIDEO');
    expect(result.isPrimary).toBe(false);
  });

  it('associates media with a variant of the same product', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId);
    const result = await service.upload(
      productId,
      await file('image/jpeg', jpegBuffer()),
      { variantId },
      actorId,
    );
    createdMediaIds.push(result.id);
    expect(result.variantId).toBe(variantId);
  });

  it('rejects a variant that belongs to another product with 404', async () => {
    const productId = await createProduct();
    const otherProductId = await createProduct();
    const otherVariantId = await createVariant(otherProductId);
    await expect(
      service.upload(
        productId,
        await file('image/jpeg', jpegBuffer()),
        { variantId: otherVariantId },
        actorId,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns 404 uploading to a soft-deleted product', async () => {
    const productId = await createProduct({ deletedAt: new Date() });
    await expect(
      service.upload(productId, await file('image/jpeg', jpegBuffer()), {}, actorId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('lists only active media ordered by sortOrder', async () => {
    const productId = await createProduct();
    const a = await service.upload(
      productId,
      await file('image/jpeg', jpegBuffer(), 'a.jpg'),
      {},
      actorId,
    );
    const b = await service.upload(
      productId,
      await file('image/jpeg', jpegBuffer(), 'b.jpg'),
      {},
      actorId,
    );
    createdMediaIds.push(a.id, b.id);

    const list = await service.list(productId);
    expect(list.map((m) => m.id)).toEqual([a.id, b.id]);

    // soft-delete one and ensure it disappears from the list
    await service.remove(a.id, actorId);
    const list2 = await service.list(productId);
    expect(list2.map((m) => m.id)).toEqual([b.id]);
  });

  it('product detail media reflects only active media', async () => {
    const productId = await createProduct();
    const a = await service.upload(
      productId,
      await file('image/jpeg', jpegBuffer()),
      {},
      actorId,
    );
    createdMediaIds.push(a.id);
    await service.remove(a.id, actorId);

    const detail = await prisma.product.findUnique({
      where: { id: productId },
      select: { media: { where: { deletedAt: null }, select: { id: true } } },
    });
    expect(detail?.media).toEqual([]);
  });

  it('deleting the primary promotes the next image', async () => {
    const productId = await createProduct();
    const a = await service.upload(
      productId,
      await file('image/jpeg', jpegBuffer()),
      {},
      actorId,
    );
    const b = await service.upload(
      productId,
      await file('image/jpeg', jpegBuffer()),
      {},
      actorId,
    );
    createdMediaIds.push(a.id, b.id);

    await service.remove(a.id, actorId);

    const promoted = await prisma.productMedia.findUnique({ where: { id: b.id } });
    expect(promoted?.isPrimary).toBe(true);
    // exactly one active primary remains
    const primaries = await prisma.productMedia.count({
      where: { productId, deletedAt: null, isPrimary: true, mediaType: 'IMAGE' },
    });
    expect(primaries).toBe(1);
  });

  it('soft-deletes media, removes binary, and audits PRODUCT_MEDIA_REMOVED', async () => {
    const productId = await createProduct();
    const uploaded = await service.upload(
      productId,
      await file('image/jpeg', jpegBuffer()),
      {},
      actorId,
    );
    createdMediaIds.push(uploaded.id);

    await service.remove(uploaded.id, actorId);

    const row = await prisma.productMedia.findUnique({ where: { id: uploaded.id } });
    expect(row?.deletedAt).not.toBeNull();

    await expect(service.getBinary(productId, uploaded.id)).rejects.toMatchObject({
      status: 404,
    });

    const audits = await prisma.auditLog.findMany({
      where: { entityId: uploaded.id, action: 'PRODUCT_MEDIA_REMOVED' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(audits[0]!.after)).not.toContain('storageKey');
  });

  it('never leaks sensitive fields in serialization', async () => {
    const productId = await createProduct();
    const uploaded = await service.upload(
      productId,
      await file('image/jpeg', jpegBuffer()),
      {},
      actorId,
    );
    createdMediaIds.push(uploaded.id);
    const serialized = JSON.stringify(uploaded);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('createdBy');
    expect(serialized).not.toContain('updatedBy');
    expect(serialized).not.toContain('deletedAt');
  });
});
