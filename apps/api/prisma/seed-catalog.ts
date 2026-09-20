/**
 * SS-131 demo seed catalog sourced from sabzsistem.com.
 *
 * Committed JSON fixtures + bundled sample images under
 * `prisma/seed-catalog/` are imported into a published demo catalog so the
 * Milestone 2 acceptance test works on a fresh `docker compose up` with no
 * manual admin work. Nothing is scraped at boot time; the fixtures are a
 * one-time snapshot of the live WooCommerce site (Sep 2026).
 *
 * Binding constraints (milestone-2-plan.md SS-131 + handoff §3):
 * - Prices on the live site are Rial; the storefront contract is Toman, so
 *   every fixture carries `priceRial` (observed) and `priceToman`
 *   (= priceRial / 10). The invariant is asserted at seed time.
 * - Media rows are created THROUGH `MediaService.upload` (constructed here
 *   with the same storage/processing wiring as `products.module.ts`), so
 *   watermarking + thumbnails (SS-129) are applied exactly as in production.
 *   Fixture binaries are copied to temp files first because the pipeline
 *   deletes its input; committed fixtures are never hand-placed in storage.
 * - Idempotent: all writes are upserts keyed by slug/sku; media is uploaded
 *   only when the product has no live media rows; inventory items are upserted
 *   per fixture stock with INITIAL_STOCK ledger entries.
 * - Every product ends PUBLISHED with a primary image; the set includes one
 *   multi-variant product (priceFrom path) and one video-bearing product
 *   (gallery video path). Development-only: called from `seed.ts`, which
 *   already gates on NODE_ENV=development.
 */
import { InventoryMovementType, PrismaClient, ProductCondition, ProductStatus } from '@prisma/client';
import { copyFile, mkdir, readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { MediaService } from '../src/modules/products/media.service';
import { sanitizeRichText } from '../src/modules/products/description-sanitize';
import { FfmpegRunner } from '../src/modules/products/media-processing/ffmpeg.runner';
import { ImageProcessorService } from '../src/modules/products/media-processing/image-processor.service';
import { MediaProcessingService } from '../src/modules/products/media-processing/media-processing.service';
import { VideoProcessorService } from '../src/modules/products/media-processing/video-processor.service';
import { WatermarkOverlayService } from '../src/modules/products/media-processing/watermark-overlay.service';
import { resolveWatermarkConfig } from '../src/modules/products/media-processing/watermark-config';
import { LocalDiskMediaStorage } from '../src/modules/products/storage/local-disk-media.storage';
import {
  DEFAULT_WAREHOUSE_CODE,
  ensureDefaultWarehouse,
} from './bootstrap';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 200;

interface FixtureCategory {
  slug: string;
  name: string;
  parentSlug: string | null;
  sortOrder: number;
}

interface FixtureBrand {
  slug: string;
  name: string;
  nameEn: string;
  isFeatured: boolean;
}

interface FixtureVariant {
  sku: string;
  name: string;
  priceRial: number;
  priceToman: string;
  compareAtRial?: number;
  compareAtToman?: string;
  stock: number;
}

interface FixtureMedia {
  file: string;
  mediaType: 'IMAGE' | 'VIDEO';
}

interface FixtureProduct {
  slug: string;
  name: string;
  brandSlug: string;
  categorySlug: string;
  condition: string;
  warranty: string;
  originCountry: string;
  shortDescription: string;
  description: string | null;
  variants: FixtureVariant[];
  media: FixtureMedia[];
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

/** The seed runs via `pnpm --filter @sabz/api prisma:seed`; resolve the
 * fixture directory regardless of whether cwd is the repo root or apps/api. */
function resolveSeedDir(): string {
  const candidates = [
    resolve(process.cwd(), 'apps/api/prisma/seed-catalog'),
    resolve(process.cwd(), 'prisma/seed-catalog'),
    join(dirname(__filename), 'seed-catalog'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'products.json'))) {
      return candidate;
    }
  }
  throw new Error(
    `Seed catalog fixtures not found (tried: ${candidates.join(', ')}).`,
  );
}

function assertSlug(value: string, kind: string): void {
  if (!SLUG_PATTERN.test(value) || value.length > MAX_SLUG_LENGTH) {
    throw new Error(
      `Invalid ${kind} slug "${value}": must match ${SLUG_PATTERN} and be ≤${MAX_SLUG_LENGTH} chars.`,
    );
  }
}

export interface SeedCatalogStats {
  categories: number;
  brands: number;
  products: number;
  variants: number;
  media: number;
}

export async function seedCatalog(actorId: string): Promise<SeedCatalogStats> {
  const seedDir = resolveSeedDir();
  const imagesDir = join(seedDir, 'images');
  const categories: FixtureCategory[] = JSON.parse(
    await readFile(join(seedDir, 'categories.json'), 'utf8'),
  ).categories;
  const brands: FixtureBrand[] = JSON.parse(
    await readFile(join(seedDir, 'brands.json'), 'utf8'),
  ).brands;
  const products: FixtureProduct[] = JSON.parse(
    await readFile(join(seedDir, 'products.json'), 'utf8'),
  ).products;

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    // Fixture validation (fail fast before any write).
    for (const category of categories) {
      assertSlug(category.slug, 'category');
      if (category.parentSlug !== null) {
        assertSlug(category.parentSlug, 'category parent');
      }
    }
    for (const brand of brands) {
      assertSlug(brand.slug, 'brand');
    }
    for (const product of products) {
      assertSlug(product.slug, 'product');
      if (
        !Object.values(ProductCondition).includes(
          product.condition as ProductCondition,
        )
      ) {
        throw new Error(
          `Product "${product.slug}": unknown condition "${product.condition}".`,
        );
      }
      if (product.variants.length === 0) {
        throw new Error(`Product "${product.slug}" must declare ≥1 variant.`);
      }
      if (product.media.length === 0) {
        throw new Error(`Product "${product.slug}" must declare ≥1 media.`);
      }
      for (const variant of product.variants) {
        // Rial→Toman normalization (Decision 1): the live site displays Rial.
        if (Number(variant.priceToman) * 10 !== variant.priceRial) {
          throw new Error(
            `Variant "${variant.sku}": priceToman must equal priceRial/10.`,
          );
        }
        if (
          (variant.compareAtRial === undefined) !==
          (variant.compareAtToman === undefined)
        ) {
          throw new Error(
            `Variant "${variant.sku}": compareAtRial/compareAtToman must be set together.`,
          );
        }
        if (
          variant.compareAtRial !== undefined &&
          (Number(variant.compareAtToman) * 10 !== variant.compareAtRial ||
            variant.compareAtRial <= variant.priceRial)
        ) {
          throw new Error(
            `Variant "${variant.sku}": compareAtToman must equal compareAtRial/10 and exceed priceRial.`,
          );
        }
        if (!Number.isInteger(variant.stock) || variant.stock < 0) {
          throw new Error(`Variant "${variant.sku}": stock must be ≥0.`);
        }
      }
      for (const media of product.media) {
        const ext = media.file.slice(media.file.lastIndexOf('.')).toLowerCase();
        const mime = MIME_BY_EXTENSION[ext];
        if (!mime) {
          throw new Error(`Media "${media.file}": unsupported extension.`);
        }
        if (
          (media.mediaType === 'IMAGE') !==
          (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp')
        ) {
          throw new Error(
            `Media "${media.file}": declared type contradicts the file.`,
          );
        }
        if (!existsSync(join(imagesDir, media.file))) {
          throw new Error(`Media fixture missing: ${media.file}.`);
        }
      }
    }

    // Categories (parents first; adjacency tree, SetNull on delete).
    const bySlug = new Map(categories.map((c) => [c.slug, c]));
    const ordered: FixtureCategory[] = [];
    const visiting = new Set<string>();
    const visit = (slug: string): void => {
      const node = bySlug.get(slug);
      if (!node || ordered.includes(node)) {
        return;
      }
      if (visiting.has(slug)) {
        throw new Error(`Category cycle at "${slug}".`);
      }
      visiting.add(slug);
      if (node.parentSlug !== null) {
        if (!bySlug.has(node.parentSlug)) {
          throw new Error(`Category "${slug}" has unknown parent.`);
        }
        visit(node.parentSlug);
      }
      visiting.delete(slug);
      ordered.push(node);
    };
    for (const category of categories) {
      visit(category.slug);
    }
    for (const category of ordered) {
      const parent =
        category.parentSlug === null
          ? null
          : await prisma.category.findUniqueOrThrow({
              where: { slug: category.parentSlug },
              select: { id: true },
            });
      await prisma.category.upsert({
        where: { slug: category.slug },
        update: {
          name: category.name,
          sortOrder: category.sortOrder,
          isVisible: true,
          deletedAt: null,
          parentId: parent?.id ?? null,
        },
        create: {
          name: category.name,
          slug: category.slug,
          sortOrder: category.sortOrder,
          isVisible: true,
          parentId: parent?.id ?? null,
          createdBy: actorId,
        },
      });
    }

    // Brands.
    for (const brand of brands) {
      await prisma.brand.upsert({
        where: { slug: brand.slug },
        update: {
          name: brand.name,
          description: null,
          nameEn: brand.nameEn,
          isFeatured: brand.isFeatured,
          deletedAt: null,
        },
        create: {
          name: brand.name,
          slug: brand.slug,
          description: null,
          nameEn: brand.nameEn,
          isFeatured: brand.isFeatured,
          createdBy: actorId,
        },
      });
    }

    // Media pipeline wired exactly like products.module.ts so seeded binaries
    // are watermarked + thumbnailed identically to admin uploads.
    const storageDir =
      process.env.PRODUCT_MEDIA_STORAGE_DIR ?? '.data/product-media';
    const tempDir =
      process.env.PRODUCT_MEDIA_TEMP_DIR ?? join(storageDir, 'tmp');
    await mkdir(tempDir, { recursive: true });
    const auditService = new AuditService(prisma);
    const storage = new LocalDiskMediaStorage(storageDir);
    const watermarkConfig = resolveWatermarkConfig();
    const overlay = new WatermarkOverlayService(watermarkConfig);
    const mediaProcessing = new MediaProcessingService(
      new ImageProcessorService(overlay, watermarkConfig),
      new VideoProcessorService(
        overlay,
        new FfmpegRunner(FfmpegRunner.resolveBinary()),
        watermarkConfig,
        tempDir,
      ),
      watermarkConfig,
    );
    const mediaService = new MediaService(
      prisma,
      auditService,
      storage,
      mediaProcessing,
      tempDir,
    );
    const uploadScratch = join(tempDir, 'seed-catalog');
    await mkdir(uploadScratch, { recursive: true });

    let variantCount = 0;
    let mediaCount = 0;
    for (const product of products) {
      const brand = await prisma.brand.findUniqueOrThrow({
        where: { slug: product.brandSlug },
        select: { id: true },
      });
      const category = await prisma.category.findUniqueOrThrow({
        where: { slug: product.categorySlug },
        select: { id: true },
      });

      let row = await prisma.product.findUnique({
        where: { slug: product.slug },
        select: { id: true, status: true, deletedAt: true },
      });
      if (!row) {
        row = await prisma.product.create({
          data: {
            name: product.name,
            slug: product.slug,
            shortDescription: product.shortDescription,
            description: product.description
              ? sanitizeRichText(product.description)
              : null,
            brandId: brand.id,
            categoryId: category.id,
            warranty: product.warranty,
            condition: product.condition as ProductCondition,
            status: ProductStatus.DRAFT,
            originCountry: product.originCountry,
            createdBy: actorId,
          },
          select: { id: true, status: true, deletedAt: true },
        });
        await auditService.log({
          userId: actorId,
          action: 'PRODUCT_CREATED',
          entity: 'Product',
          entityId: row.id,
          before: null,
          after: { name: product.name, slug: product.slug, seed: true },
        });
      }
      const productId = row.id;

      for (const variant of product.variants) {
        await prisma.productVariant.upsert({
          where: { sku: variant.sku },
          update: {},
          create: {
            productId,
            sku: variant.sku,
            name: variant.name,
            price: variant.priceToman,
            compareAtPrice: variant.compareAtToman ?? null,
            createdBy: actorId,
          },
        });
        variantCount += 1;
      }

      // Upload through MediaService so watermarking/thumbnails match
      // production. The pipeline deletes its input, so each fixture is copied
      // to a scratch temp file first; committed fixtures are never consumed.
      const existingMedia = await prisma.productMedia.count({
        where: { productId, deletedAt: null },
      });
      if (existingMedia === 0) {
        for (const media of product.media) {
          const ext = media.file.slice(media.file.lastIndexOf('.')).toLowerCase();
          const scratch = join(
            uploadScratch,
            `${product.slug}-${mediaCount}-${Date.now()}${ext}`,
          );
          await copyFile(join(imagesDir, media.file), scratch);
          const { size } = await stat(scratch);
          await mediaService.upload(
            productId,
            {
              fieldname: 'file',
              originalname: media.file,
              encoding: '7bit',
              mimetype: MIME_BY_EXTENSION[ext] as 'image/jpeg',
              size: size,
              destination: uploadScratch,
              filename: scratch,
              path: scratch,
              buffer: undefined as never,
              stream: undefined as never,
            } as Express.Multer.File,
            { mediaType: media.mediaType },
            actorId,
          );
          mediaCount += 1;
        }
      }

      if (row.status === ProductStatus.DRAFT) {
        await prisma.$transaction(async (tx) => {
          await tx.product.updateMany({
            where: { id: productId, status: ProductStatus.DRAFT },
            data: { status: ProductStatus.PUBLISHED, updatedBy: actorId },
          });
          await auditService.log(
            {
              userId: actorId,
              action: 'PRODUCT_PUBLISHED',
              entity: 'Product',
              entityId: productId,
              before: { status: ProductStatus.DRAFT },
              after: { status: ProductStatus.PUBLISHED },
            },
            tx,
          );
        });
      }
    }

    // Inventory: fixture stocks live in authoritative InventoryItem rows on the
    // default warehouse (SS-130: no denormalized variant projection). Upserts
    // are idempotent — existing items and their ledger history are untouched.
    await ensureDefaultWarehouse(prisma);
    const defaultWarehouse = await prisma.warehouse.findUniqueOrThrow({
      where: { code: DEFAULT_WAREHOUSE_CODE },
      select: { id: true },
    });
    for (const product of products) {
      for (const variant of product.variants) {
        const variantRow = await prisma.productVariant.findUniqueOrThrow({
          where: { sku: variant.sku },
          select: { id: true },
        });
        const item = await prisma.inventoryItem.upsert({
          where: {
            variantId_warehouseId: {
              variantId: variantRow.id,
              warehouseId: defaultWarehouse.id,
            },
          },
          update: {},
          create: {
            warehouseId: defaultWarehouse.id,
            variantId: variantRow.id,
            quantityOnHand: variant.stock,
            quantityReserved: 0,
          },
          select: { id: true },
        });
        const movementCount = await prisma.inventoryMovement.count({
          where: {
            inventoryItemId: item.id,
            type: InventoryMovementType.INITIAL_STOCK,
          },
        });
        if (movementCount === 0) {
          await prisma.inventoryMovement.create({
            data: {
              inventoryItemId: item.id,
              variantId: variantRow.id,
              warehouseId: defaultWarehouse.id,
              type: InventoryMovementType.INITIAL_STOCK,
              quantity: variant.stock,
              reservedDelta: 0,
              onHandBefore: 0,
              onHandAfter: variant.stock,
              reservedBefore: 0,
              reservedAfter: 0,
            },
          });
        }
      }
    }

    return {
      categories: categories.length,
      brands: brands.length,
      products: products.length,
      variants: variantCount,
      media: mediaCount,
    };
  } finally {
    await prisma.$disconnect();
  }
}

// Allow standalone runs: `tsx prisma/seed-catalog.ts` (requires DATABASE_URL;
// development only, like seed.ts). The actor is the dev admin when present.
if (require.main === module) {
  (async (): Promise<void> => {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error(
        'Seeding is development-only. Set NODE_ENV=development to run it.',
      );
    }
    const standalone = new PrismaClient();
    const mobile = process.env.DEV_ADMIN_MOBILE;
    const admin = mobile
      ? await standalone.user.findUnique({
          where: { mobile },
          select: { id: true },
        })
      : null;
    await standalone.$disconnect();
    if (!admin) {
      throw new Error(
        'Dev admin not found. Run the main seed first (DEV_ADMIN_MOBILE).',
      );
    }
    const stats = await seedCatalog(admin.id);
    console.log(`Seed catalog complete: ${JSON.stringify(stats)}.`);
  })().catch((error) => {
    console.error('Seed catalog failed:', error);
    process.exitCode = 1;
  });
}
