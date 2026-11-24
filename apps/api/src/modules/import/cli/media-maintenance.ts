#!/usr/bin/env tsx
/**
 * One-off, guarded media-pipeline remediation.
 *
 * 1. `--reprocess-demo`: re-upload the committed demo fixture images/videos
 *    through the real MediaService pipeline (background removal, square
 *    canvas, revised smaller watermark, thumbnail, retained original). The
 *    old unprocessed demo rows are soft-deleted only after every replacement
 *    verifies successfully.
 * 2. `--quarantine-stale`: soft-deletes active IMAGE rows still marked NONE
 *    when the same product already has a PROCESSED image, and promotes a
 *    processed image to primary. Used for CSV gallery images that failed the
 *    background-removal quality gate and obsolete legacy rows.
 *
 * Both modes require the isolated development DB and a verified backup.
 */
import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { StorefrontCacheService } from '../../../common/storefront-cache/storefront-cache.service';
import {
  CATALOG_PRODUCTS_TAG,
  CATALOG_TREE_TAG,
  productDetailTag,
} from '../../../common/storefront-cache/catalog-tags';
import { BackgroundRemovalService } from '../../products/media-processing/background-removal.service';
import { FfmpegRunner } from '../../products/media-processing/ffmpeg.runner';
import { ImageProcessorService } from '../../products/media-processing/image-processor.service';
import { MediaProcessingService } from '../../products/media-processing/media-processing.service';
import { VideoProcessorService } from '../../products/media-processing/video-processor.service';
import { resolveWatermarkConfig } from '../../products/media-processing/watermark-config';
import { WatermarkOverlayService } from '../../products/media-processing/watermark-overlay.service';
import { MediaService } from '../../products/media.service';
import { LocalDiskMediaStorage } from '../../products/storage/local-disk-media.storage';
import { assertApplySafe } from '../cli/guard';

const ACTOR = 'media-maintenance';

interface FixtureMedia {
  file: string;
  mediaType: 'IMAGE' | 'VIDEO';
}

interface FixtureProduct {
  slug: string;
  media: FixtureMedia[];
}

const MIME_BY_EXTENSION: Record<string, 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4'> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

interface MaintenanceReport {
  generatedAt: string;
  demo: {
    products: number;
    uploaded: number;
    replaced: number;
    failed: Array<{ slug: string; error: string }>;
  };
  quarantine: {
    products: number;
    deleted: number;
    primaryPromoted: number;
  };
}

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const guard = await assertApplySafe({
      prisma,
      confirmDatabase: arg('confirm-database'),
      backupPath: arg('backup'),
      operation: 'Media pipeline remediation',
    });
    console.log(
      `database guard: ${guard.database} @ ${guard.serverAddress ?? 'local'} | backup ${guard.backupPath} (${guard.backupBytes} bytes, sha256 ${guard.backupSha256})`,
    );

    const report: MaintenanceReport = {
      generatedAt: new Date().toISOString(),
      demo: { products: 0, uploaded: 0, replaced: 0, failed: [] },
      quarantine: { products: 0, deleted: 0, primaryPromoted: 0 },
    };
    const affectedSlugs = new Set<string>();

    const storageDir =
      process.env.PRODUCT_MEDIA_STORAGE_DIR ?? '.data/product-media';
    const tempDir =
      process.env.PRODUCT_MEDIA_TEMP_DIR ?? join(storageDir, 'tmp');
    await mkdir(tempDir, { recursive: true });
    const scratchDir = join(tempDir, 'media-maintenance');
    await mkdir(scratchDir, { recursive: true });

    const watermark = resolveWatermarkConfig();
    const backgroundRemoval = new BackgroundRemovalService(new ConfigService());
    if (!watermark.enabled || !watermark.logoOnly) {
      throw new Error(
        'The official logo-only watermark must be enabled for media remediation.',
      );
    }
    if (!watermark.logoPath || !existsSync(watermark.logoPath)) {
      throw new Error(
        `The watermark logo asset is missing at ${watermark.logoPath}.`,
      );
    }
    if (
      !backgroundRemoval.enabled() ||
      !existsSync(backgroundRemoval.modelPath())
    ) {
      throw new Error(
        'Background removal is unavailable; media remediation is blocked.',
      );
    }
    const overlay = new WatermarkOverlayService(watermark);
    const processing = new MediaProcessingService(
      new ImageProcessorService(overlay, watermark),
      new VideoProcessorService(
        overlay,
        new FfmpegRunner(FfmpegRunner.resolveBinary()),
        watermark,
        tempDir,
      ),
      watermark,
      backgroundRemoval,
    );
    const storage = new LocalDiskMediaStorage(storageDir);
    const cache = new StorefrontCacheService(new ConfigService());
    const mediaService = new MediaService(
      prisma,
      new AuditService(prisma),
      storage,
      processing,
      tempDir,
      cache,
    );

    if (flag('reprocess-demo')) {
      const fixtureDir = resolve(
        process.cwd(),
        arg('demo-fixtures') ?? 'prisma/seed-catalog',
      );
      const products = (
        JSON.parse(
          readFileSync(join(fixtureDir, 'products.json'), 'utf8'),
        ) as { products: FixtureProduct[] }
      ).products;

      for (const fixture of products) {
        const product = await prisma.product.findFirst({
          where: { slug: fixture.slug, deletedAt: null },
          select: { id: true, status: true },
        });
        if (!product) {
          continue;
        }
        const legacy = await prisma.productMedia.findMany({
          where: {
            productId: product.id,
            deletedAt: null,
            mediaType: 'IMAGE',
            processingStatus: 'NONE',
            sourceUrl: null,
          },
          select: { id: true },
        });
        if (legacy.length === 0) {
          continue;
        }
        report.demo.products += 1;
        const uploadedIds: string[] = [];
        try {
          for (const [index, media] of fixture.media.entries()) {
            const ext = media.file.slice(media.file.lastIndexOf('.')).toLowerCase();
            const mime = MIME_BY_EXTENSION[ext];
            if (!mime) {
              throw new Error(`unsupported fixture extension ${ext}`);
            }
            const scratch = join(
              scratchDir,
              `${fixture.slug}-${index}-${Date.now()}${ext}`,
            );
            await copyFile(join(fixtureDir, 'images', media.file), scratch);
            const { size } = await stat(scratch);
            const summary = await mediaService.upload(
              product.id,
              {
                fieldname: 'file',
                originalname: media.file,
                encoding: '7bit',
                mimetype: mime,
                size,
                destination: scratchDir,
                filename: scratch,
                path: scratch,
                buffer: undefined as never,
                stream: undefined as never,
              } as Express.Multer.File,
              { mediaType: media.mediaType },
              ACTOR,
            );
            uploadedIds.push(summary.id);
            if (media.mediaType === 'IMAGE' && summary.processingStatus !== 'PROCESSED') {
              throw new Error(
                `${media.file}: processing status ${summary.processingStatus ?? 'NONE'}`,
              );
            }
            report.demo.uploaded += 1;
          }

          // All replacements verified: retire the old rows and restore CSV/
          // fixture order + exactly one primary.
          await prisma.$transaction(async (tx) => {
            await tx.productMedia.updateMany({
              where: { id: { in: legacy.map((row) => row.id) } },
              data: { deletedAt: new Date(), updatedBy: ACTOR },
            });
            await tx.productMedia.updateMany({
              where: { id: { in: uploadedIds } },
              data: { isPrimary: false },
            });
            for (const [index, id] of uploadedIds.entries()) {
              await tx.productMedia.update({
                where: { id },
                data: { sortOrder: index, isPrimary: index === 0 },
              });
            }
          });
          report.demo.replaced += legacy.length;
          affectedSlugs.add(fixture.slug);
        } catch (error) {
          if (uploadedIds.length > 0) {
            await prisma.productMedia.updateMany({
              where: { id: { in: uploadedIds } },
              data: { deletedAt: new Date(), updatedBy: ACTOR },
            });
          }
          report.demo.failed.push({
            slug: fixture.slug,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (flag('quarantine-stale')) {
      const allNone = await prisma.productMedia.findMany({
        where: {
          deletedAt: null,
          processingStatus: 'NONE',
        },
        select: {
          id: true,
          productId: true,
          mediaType: true,
          sourceUrl: true,
          isPrimary: true,
          sortOrder: true,
          product: { select: { slug: true } },
        },
      });
      // Image rows, plus rows misclassified as VIDEO by the old AVIF bug
      // (their source URL still ends in an image extension).
      const candidates = allNone.filter(
        (row) =>
          row.mediaType === 'IMAGE' ||
          (row.sourceUrl !== null &&
            /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(row.sourceUrl)),
      );
      const byProduct = new Map<string, typeof candidates>();
      for (const row of candidates) {
        const list = byProduct.get(row.productId) ?? [];
        list.push(row);
        byProduct.set(row.productId, list);
      }
      for (const [productId, stale] of byProduct) {
        const processed = await prisma.productMedia.findMany({
          where: {
            productId,
            deletedAt: null,
            mediaType: 'IMAGE',
            processingStatus: 'PROCESSED',
          },
          select: { id: true, isPrimary: true, sortOrder: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
        if (processed.length === 0) {
          continue;
        }
        report.quarantine.products += 1;
        await prisma.$transaction(async (tx) => {
          await tx.productMedia.updateMany({
            where: { id: { in: stale.map((row) => row.id) } },
            data: { deletedAt: new Date(), updatedBy: ACTOR },
          });
          if (!processed.some((row) => row.isPrimary)) {
            await tx.productMedia.updateMany({
              where: { productId, isPrimary: true },
              data: { isPrimary: false },
            });
            await tx.productMedia.update({
              where: { id: processed[0]!.id },
              data: { isPrimary: true },
            });
            report.quarantine.primaryPromoted += 1;
          }
        });
        report.quarantine.deleted += stale.length;
        affectedSlugs.add(stale[0]!.product.slug);
      }
    }

    if (affectedSlugs.size > 0) {
      await cache
        .invalidate([
          CATALOG_PRODUCTS_TAG,
          CATALOG_TREE_TAG,
          ...[...affectedSlugs].map((slug) => productDetailTag(slug)),
        ])
        .catch(() => undefined);
    }

    const out = resolve(
      process.cwd(),
      arg('out') ?? '.data/backups/media-maintenance.json',
    );
    await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await rm(scratchDir, { recursive: true, force: true }).catch(() => undefined);
    console.log(JSON.stringify(report, null, 2));
    console.log(`report artifact: ${out}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
