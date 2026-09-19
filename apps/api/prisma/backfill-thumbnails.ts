/**
 * SS-129 backfill: generates watermarked WEBP thumbnails for product image
 * media rows that predate the thumbnail pipeline.
 *
 * - Idempotent: rows that already have a thumbnailKey (or are videos, which
 *   never get thumbnails) are skipped.
 * - The thumbnail is derived from the STORED asset, which is already the
 *   watermarked one — so the derivative is branded by construction.
 * - Each row is updated only after its thumbnail binary is persisted; a
 *   failed row is logged and the run continues (re-run to retry).
 *
 * Usage (development/local only):
 *   pnpm --filter @sabz/api media:backfill-thumbnails
 * Environment: DATABASE_URL and PRODUCT_MEDIA_STORAGE_DIR (defaults to
 * `.data/product-media`, the Compose-mounted storage location).
 */
import { ProductMediaType } from '@prisma/client';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { PrismaClient } from '@prisma/client';
import { LocalDiskMediaStorage } from '../src/modules/products/storage/local-disk-media.storage';
import { ImageProcessorService } from '../src/modules/products/media-processing/image-processor.service';
import { WatermarkOverlayService } from '../src/modules/products/media-processing/watermark-overlay.service';
import { resolveWatermarkConfig } from '../src/modules/products/media-processing/watermark-config';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const storageDir =
    process.env.PRODUCT_MEDIA_STORAGE_DIR ?? '.data/product-media';
  const storage = new LocalDiskMediaStorage(storageDir);
  const config = resolveWatermarkConfig();
  const overlay = new WatermarkOverlayService(config);
  // The stored asset is already watermarked; the backfill only resizes, so
  // the overlay is never invoked.
  const imageProcessor = new ImageProcessorService(overlay, config);

  const pending = await prisma.productMedia.findMany({
    where: { deletedAt: null, mediaType: ProductMediaType.IMAGE, thumbnailKey: null },
    select: { id: true, productId: true, storageKey: true },
    orderBy: { createdAt: 'asc' as const },
  });

  console.log(`Backfilling thumbnails for ${pending.length} image(s)...`);
  let done = 0;
  let failed = 0;

  const tempDir = await mkdtemp(join(tmpdir(), 'thumb-backfill-'));
  try {
    for (const media of pending) {
      const thumbnailKey = `products/${media.productId}/${media.id}.thumb.webp`;
      const thumbnailPath = join(tempDir, `${media.id}.thumb.webp`);
      try {
        const original = await storage.get(media.storageKey);
        const { writeFile } = await import('fs/promises');
        const originalPath = join(tempDir, `${media.id}.src`);
        await writeFile(originalPath, original);
        const { thumbnailSizeBytes } = await imageProcessor.generateThumbnail(
          originalPath,
          thumbnailPath,
        );
        await storage.putFile(thumbnailKey, thumbnailPath);
        await prisma.productMedia.update({
          where: { id: media.id },
          data: { thumbnailKey, thumbnailSizeBytes },
        });
        done += 1;
      } catch (error) {
        failed += 1;
        console.error(
          `Failed to backfill thumbnail for media ${media.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log(
    `Thumbnail backfill complete: ${done} generated, ${failed} failed, ${
      pending.length - done - failed
    } skipped.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
