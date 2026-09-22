import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, rm, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { readFileHeader } from '../media-file';
import { FfmpegError, FfmpegRunner } from './ffmpeg.runner';
import { WatermarkOverlayService } from './watermark-overlay.service';
import { watermarkFilterPosition } from './watermark-position';
import { WatermarkConfig, watermarkVideoWidthExpr } from './watermark-config';
import type { ProcessedAsset } from './image-processor.service';

/** Reference overlay width the PNG is rendered at; scale2ref downsamples it
 * to the per-video target below. 720px covers up to 4K widths at the default
 * size ratio (3840 * 0.17 = 653) without ever upscaling the mark. */
const VIDEO_OVERLAY_WIDTH = 720;

/**
 * Server-side product video watermarking (CATALOG-007) via FFmpeg.
 *
 * The watermark (logo + company name) is overlaid on every frame and the
 * video is re-encoded with libx264 (crf 20) while the audio track is copied
 * untouched. The overlay is sized from the *video* width (`main_w`) through
 * `scale2ref` with the same ratio/clamps as images (SS-210 shared
 * `WatermarkSpec`), so the mark stays proportional from small clips to 4K.
 *
 * FFmpeg is always invoked through `FfmpegRunner` with an argument array and
 * fixed filter strings — no shell, no user-controlled filenames in arguments.
 * The interpolated filter values are server-side numerics (ratio to 3
 * decimals, integer clamps), never client input.
 */
@Injectable()
export class VideoProcessorService {
  private readonly logger = new Logger(VideoProcessorService.name);

  constructor(
    private readonly overlay: WatermarkOverlayService,
    private readonly ffmpeg: FfmpegRunner,
    private readonly config: WatermarkConfig,
    private readonly tempDir: string,
  ) {}

  async process(inputPath: string, outputPath: string): Promise<ProcessedAsset> {
    const overlayPath = join(this.tempDir, `${randomUUID()}-wm.png`);
    try {
      const overlay = await this.overlay.renderOverlay(VIDEO_OVERLAY_WIDTH);
      await mkdir(this.tempDir, { recursive: true });
      await writeFile(overlayPath, overlay.buffer);

      const { x, y } = watermarkFilterPosition(this.config);
      // Size the mark from the video width with the shared image clamps
      // (SS-210 shared sizing helper): in scale2ref, main_w/main_h are the
      // reference (main video) dims.
      const widthExpr = watermarkVideoWidthExpr(this.config);

      await this.ffmpeg.run([
        '-y',
        '-i', inputPath,
        '-i', overlayPath,
        '-filter_complex',
        `[1:v][0:v]scale2ref=w='${widthExpr}':h=-2[wm][base];[base][wm]overlay=${x}:${y}:format=auto[outv]`,
        '-map', '[outv]',
        '-map', '0:a?',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        outputPath,
      ]);

      await this.assertValidOutput(outputPath);

      const info = await stat(outputPath);
      return { outputPath, sizeBytes: info.size };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof FfmpegError) {
        this.logger.error(
          `Video watermark processing failed (exit=${error.exitCode}, timeout=${error.timedOut}).`,
        );
        throw new BadRequestException('پردازش ویدئو ناموفق بود.');
      }
      this.logger.error(
        `Video watermark processing failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException('پردازش ویدئو ناموفق بود.');
    } finally {
      await rm(overlayPath, { force: true });
    }
  }

  /** Rejects empty/truncated FFmpeg outputs so a broken file is never stored. */
  private async assertValidOutput(outputPath: string): Promise<void> {
    const info = await stat(outputPath);
    if (info.size === 0) {
      throw new BadRequestException('پردازش ویدئو ناموفق بود.');
    }
    const handle = await readFileHeader(outputPath, 16);
    const isMp4 =
      handle.length >= 8 &&
      handle.subarray(4, 8).equals(Buffer.from([0x66, 0x74, 0x79, 0x70]));
    if (!isMp4) {
      throw new BadRequestException('پردازش ویدئو ناموفق بود.');
    }
  }
}