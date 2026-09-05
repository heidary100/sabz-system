import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { WatermarkOverlayService } from './watermark-overlay.service';
import { watermarkOffsetFor } from './watermark-position';
import { WATERMARK_CONFIG, WatermarkConfig } from './watermark-config';
import type { AllowedMediaMimeType } from '../media-validation';

export interface ProcessedAsset {
  outputPath: string;
  sizeBytes: number;
}

/**
 * Server-side product image watermarking (CATALOG-007). Every uploaded product
 * image is composited with the company watermark (logo + company name) before
 * it is stored, so the downloaded/served asset is always the branded one.
 *
 * The composite preserves the original dimensions and format (JPEG/PNG/WEBP);
 * PNG/WEBP alpha is retained. The overlay is a PNG with baked transparency, so
 * only the intended watermark pixels change.
 */
@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  constructor(
    private readonly overlay: WatermarkOverlayService,
    @Inject(WATERMARK_CONFIG) private readonly config: WatermarkConfig,
  ) {
    // Disable libvips' operation cache: it retains opened input images
    // (including memory-mapped temp upload files) and on Windows that keeps
    // the file handle open, breaking the pipeline's temp-file cleanup. The
    // pipeline never re-reads the same image, so the cache is pure overhead.
    sharp.cache(false);
  }

  async process(
    inputPath: string,
    _detectedMime: AllowedMediaMimeType,
    outputPath: string,
  ): Promise<ProcessedAsset> {
    try {
      const metadata = await sharp(inputPath).metadata();
      const sourceWidth = metadata.width ?? 0;
      const sourceHeight = metadata.height ?? 0;
      if (sourceWidth === 0 || sourceHeight === 0) {
        throw new BadRequestException('پردازش تصویر ناموفق بود.');
      }

      const overlayWidth = Math.round(
        Math.min(
          this.config.maxSizePx,
          Math.max(this.config.minSizePx, sourceWidth * this.config.sizeRatio),
        ),
      );
      const overlay = await this.overlay.renderOverlay(overlayWidth);

      // The overlay must never exceed the image dimensions (sharp rejects a
      // composite layer larger than the base). Small images (e.g. a 200px
      // thumbnail) get a proportionally scaled-down overlay.
      const scale = Math.min(
        1,
        sourceWidth / overlay.width,
        sourceHeight / overlay.height,
      );
      let overlayBuffer = overlay.buffer;
      let overlayW = overlay.width;
      let overlayH = overlay.height;
      if (scale < 1) {
        const scaled = await sharp(overlay.buffer)
          .resize({
            width: Math.max(1, Math.round(overlay.width * scale)),
            height: Math.max(1, Math.round(overlay.height * scale)),
          })
          .png()
          .toBuffer();
        const scaledMeta = await sharp(scaled).metadata();
        overlayBuffer = scaled;
        overlayW = scaledMeta.width ?? overlayW;
        overlayH = scaledMeta.height ?? overlayH;
      }

      const { left, top } = watermarkOffsetFor(
        this.config,
        sourceWidth,
        sourceHeight,
        overlayW,
        overlayH,
      );

      await sharp(inputPath)
        .composite([{ input: overlayBuffer, left, top }])
        .toFile(outputPath);

      const sizeBytes = await this.fileSize(outputPath);
      return { outputPath, sizeBytes };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Image watermark processing failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException('پردازش تصویر ناموفق بود.');
    }
  }

  private async fileSize(path: string): Promise<number> {
    const { stat } = await import('fs/promises');
    const info = await stat(path);
    return info.size;
  }
}