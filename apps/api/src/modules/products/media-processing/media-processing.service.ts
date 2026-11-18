import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { stat, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  extensionForMediaMime,
  isImageMime,
  type AllowedMediaMimeType,
} from '../media-validation';
import { ImageProcessorService, ProcessedAsset } from './image-processor.service';
import { VideoProcessorService } from './video-processor.service';
import {
  BackgroundRemovalQualityError,
  BackgroundRemovalService,
  BackgroundRemovalUnavailableError,
} from './background-removal.service';
import { WATERMARK_CONFIG, WatermarkConfig } from './watermark-config';

/**
 * Facade over the server-side watermark pipeline (CATALOG-007). Dispatches to
 * the sharp image processor or the FFmpeg video processor based on the
 * detected MIME type, always writing the processed asset to a new
 * server-generated temp path. When global watermarking is disabled (local
 * tests/dev), the original temp file is returned untouched for the default
 * product-media profile. Callers that explicitly request a clean merchandising
 * profile (`watermark: false`) still get normal re-encoding/thumbnail
 * generation without a mark.
 */
@Injectable()
export class MediaProcessingService {
  constructor(
    private readonly imageProcessor: ImageProcessorService,
    private readonly videoProcessor: VideoProcessorService,
    @Inject(WATERMARK_CONFIG) private readonly config: WatermarkConfig,
    @Optional() private readonly backgroundRemoval?: BackgroundRemovalService,
  ) {}

  async process(
    inputPath: string,
    detectedMime: AllowedMediaMimeType,
    outputDir: string,
    options: { watermark?: boolean; backgroundRemoval?: boolean } = {},
  ): Promise<ProcessedAsset> {
    if (!this.config.enabled && options.watermark !== false) {
      // Watermarking disabled (local tests/dev): the original is stored
      // verbatim and no thumbnail derivative is produced (SS-129 consumers
      // fall back to the original while thumbnailKey is null).
      const info = await stat(inputPath);
      return { outputPath: inputPath, sizeBytes: info.size };
    }

    if (isImageMime(detectedMime)) {
      let basePath = inputPath;
      let removal:
        | {
            backgroundRemoved: boolean;
            processingStatus: 'PROCESSED' | 'SKIPPED' | 'FAILED';
            processingModel?: string;
            processingError?: string;
          }
        | undefined;
      if (options.backgroundRemoval === true && this.backgroundRemoval) {
        try {
          const result = await this.backgroundRemoval.remove(inputPath);
          basePath = join(outputDir, `${randomUUID()}.removed.png`);
          await writeFile(basePath, result.buffer);
          removal = {
            backgroundRemoved: result.backgroundRemoved,
            processingStatus: result.skippedReason
              ? 'SKIPPED'
              : 'PROCESSED',
            processingModel: result.model,
          };
        } catch (error) {
          // Safe failure path: retain the original and record the reason.
          // A background-removal failure never publishes a damaged crop or a
          // silent half-processed derivative.
          const unavailable =
            error instanceof BackgroundRemovalUnavailableError;
          const quality = error instanceof BackgroundRemovalQualityError;
          removal = {
            backgroundRemoved: false,
            processingStatus: unavailable ? 'SKIPPED' : 'FAILED',
            processingError: unavailable
              ? 'مدل حذف پس‌زمینه در سرور در دسترس نیست.'
              : quality
                ? 'کنترل کیفیت حذف پس‌زمینه ناموفق بود.'
                : 'پردازش حذف پس‌زمینه ناموفق بود.',
          };
        }
      }
      const extension =
        removal?.processingStatus === 'PROCESSED'
          ? 'png'
          : extensionForMediaMime(detectedMime);
      const outputPath = join(outputDir, `${randomUUID()}.${extension}`);
      const processingOptions =
        options.watermark === undefined
          ? undefined
          : { watermark: options.watermark };
      const processed =
        processingOptions === undefined
          ? await this.imageProcessor.process(
              basePath,
              detectedMime,
              outputPath,
            )
          : await this.imageProcessor.process(
              basePath,
              detectedMime,
              outputPath,
              processingOptions,
            );
      // SS-210 thumbnail policy ("smaller", not unmarked): the thumbnail is
      // rendered from the pre-watermark original (`inputPath`) with its own
      // smaller mark, so listing cards stay subtle. `inherit` fallback
      // resizes the watermarked asset instead. The mark is composited
      // exactly once per derivative (no double watermark). Existing stored
      // assets keep their old marks — no retroactive reprocessing (#182).
      const thumbnailPath = join(outputDir, `${randomUUID()}.thumb.webp`);
      const thumbnail =
        processingOptions === undefined
          ? await this.imageProcessor.generateThumbnail(
              basePath,
              thumbnailPath,
              processed.outputPath,
            )
          : await this.imageProcessor.generateThumbnail(
              basePath,
              thumbnailPath,
              processed.outputPath,
              processingOptions,
            );
      return {
        ...processed,
        ...thumbnail,
        ...(removal ?? {}),
        ...(removal?.processingStatus === 'PROCESSED'
          ? { mimeType: 'image/png' as const }
          : {}),
      };
    }
    const videoOutputPath = join(
      outputDir,
      `${randomUUID()}.${extensionForMediaMime(detectedMime)}`,
    );
    return this.videoProcessor.process(inputPath, videoOutputPath);
  }
}