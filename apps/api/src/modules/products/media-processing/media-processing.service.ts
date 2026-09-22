import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { stat } from 'fs/promises';
import { join } from 'path';
import {
  extensionForMediaMime,
  isImageMime,
  type AllowedMediaMimeType,
} from '../media-validation';
import { ImageProcessorService, ProcessedAsset } from './image-processor.service';
import { VideoProcessorService } from './video-processor.service';
import { WATERMARK_CONFIG, WatermarkConfig } from './watermark-config';

/**
 * Facade over the server-side watermark pipeline (CATALOG-007). Dispatches to
 * the sharp image processor or the FFmpeg video processor based on the
 * detected MIME type, always writing the processed asset to a new
 * server-generated temp path. When watermarking is disabled the original temp
 * file is returned untouched.
 */
@Injectable()
export class MediaProcessingService {
  constructor(
    private readonly imageProcessor: ImageProcessorService,
    private readonly videoProcessor: VideoProcessorService,
    @Inject(WATERMARK_CONFIG) private readonly config: WatermarkConfig,
  ) {}

  async process(
    inputPath: string,
    detectedMime: AllowedMediaMimeType,
    outputDir: string,
  ): Promise<ProcessedAsset> {
    if (!this.config.enabled) {
      // Watermarking disabled (local tests/dev): the original is stored
      // verbatim and no thumbnail derivative is produced (SS-129 consumers
      // fall back to the original while thumbnailKey is null).
      const info = await stat(inputPath);
      return { outputPath: inputPath, sizeBytes: info.size };
    }

    const extension = extensionForMediaMime(detectedMime);
    const outputPath = join(outputDir, `${randomUUID()}.${extension}`);
    if (isImageMime(detectedMime)) {
      const processed = await this.imageProcessor.process(
        inputPath,
        detectedMime,
        outputPath,
      );
      // SS-210 thumbnail policy ("smaller", not unmarked): the thumbnail is
      // rendered from the pre-watermark original (`inputPath`) with its own
      // smaller mark, so listing cards stay subtle. `inherit` fallback
      // resizes the watermarked asset instead. The mark is composited
      // exactly once per derivative (no double watermark). Existing stored
      // assets keep their old marks — no retroactive reprocessing (#182).
      const thumbnail = await this.imageProcessor.generateThumbnail(
        inputPath,
        join(outputDir, `${randomUUID()}.thumb.webp`),
        processed.outputPath,
      );
      return { ...processed, ...thumbnail };
    }
    return this.videoProcessor.process(inputPath, outputPath);
  }
}