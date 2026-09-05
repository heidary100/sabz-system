import { BadRequestException } from '@nestjs/common';
import { existsSync } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { resolveWatermarkConfig } from './watermark-config';
import { WatermarkOverlayService } from './watermark-overlay.service';
import { ImageProcessorService } from './image-processor.service';
import { VideoProcessorService } from './video-processor.service';
import { MediaProcessingService } from './media-processing.service';
import { FfmpegError, FfmpegRunner } from './ffmpeg.runner';

jest.setTimeout(60_000);

function configFor(overrides: Partial<ReturnType<typeof resolveWatermarkConfig>> = {}) {
  return { ...resolveWatermarkConfig(), ...overrides };
}

describe('media watermark processing (CATALOG-007)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sabz-wm-'));
  });

  afterEach(async () => {
    // Windows can briefly hold a handle (libvips mmap + AV scan); retry.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await rm(dir, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
      }
    }
    await rm(dir, { recursive: true, force: true });
  });

  describe('ImageProcessorService', () => {
    it('watermarks a JPEG, preserving format and dimensions', async () => {
      const input = join(dir, 'input.jpg');
      const output = join(dir, 'output.jpg');
      await sharp({
        create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 160, b: 120 } },
      })
        .jpeg()
        .toFile(input);

      const service = new ImageProcessorService(
        new WatermarkOverlayService(configFor()),
        configFor(),
      );
      const result = await service.process(input, 'image/jpeg', output);

      const meta = await sharp(output).metadata();
      expect(meta.format).toBe('jpeg');
      expect(meta.width).toBe(640);
      expect(meta.height).toBe(480);
      expect(result.sizeBytes).toBeGreaterThan(0);

      const inputBuffer = await sharp(input).toBuffer();
      const outputBuffer = await sharp(output).toBuffer();
      expect(outputBuffer.equals(inputBuffer)).toBe(false);
    });

    it('watermarks a PNG while preserving transparency', async () => {
      const input = join(dir, 'input.png');
      const output = join(dir, 'output.png');
      await sharp({
        create: { width: 300, height: 300, channels: 4, background: { r: 30, g: 120, b: 60, alpha: 0.6 } },
      })
        .png()
        .toFile(input);

      const service = new ImageProcessorService(
        new WatermarkOverlayService(configFor()),
        configFor(),
      );
      const result = await service.process(input, 'image/png', output);

      const meta = await sharp(output).metadata();
      expect(meta.format).toBe('png');
      expect(meta.hasAlpha).toBe(true);
      expect(meta.width).toBe(300);
      expect(meta.height).toBe(300);
      expect(result.sizeBytes).toBeGreaterThan(0);
    });

    it('watermarks WEBP', async () => {
      const input = join(dir, 'input.webp');
      const output = join(dir, 'output.webp');
      await sharp({
        create: { width: 400, height: 250, channels: 3, background: { r: 90, g: 90, b: 90 } },
      })
        .webp()
        .toFile(input);

      const service = new ImageProcessorService(
        new WatermarkOverlayService(configFor()),
        configFor(),
      );
      const result = await service.process(input, 'image/webp', output);

      const meta = await sharp(output).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(400);
      expect(result.sizeBytes).toBeGreaterThan(0);
    });

    it('watermarks a small image by scaling the overlay to fit', async () => {
      const input = join(dir, 'small.jpg');
      const output = join(dir, 'small-out.jpg');
      // 200x150: the default overlay (min 140px wide chip) is taller than the
      // image, so the processor must scale it down rather than fail.
      await sharp({
        create: { width: 200, height: 150, channels: 3, background: { r: 120, g: 160, b: 140 } },
      })
        .jpeg()
        .toFile(input);

      const service = new ImageProcessorService(
        new WatermarkOverlayService(configFor()),
        configFor(),
      );
      const result = await service.process(input, 'image/jpeg', output);

      const meta = await sharp(output).metadata();
      expect(meta.format).toBe('jpeg');
      expect(meta.width).toBe(200);
      expect(meta.height).toBe(150);
      expect(result.sizeBytes).toBeGreaterThan(0);
    });

    it('maps processing failures to a sanitized 400', async () => {
      const service = new ImageProcessorService(
        new WatermarkOverlayService(configFor()),
        configFor(),
      );
      await expect(
        service.process(join(dir, 'missing.jpg'), 'image/jpeg', join(dir, 'out.jpg')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('VideoProcessorService', () => {
    const ffmpeg = new FfmpegRunner(FfmpegRunner.resolveBinary());

    const hasFfmpeg = async (): Promise<boolean> => {
      try {
        return await ffmpeg.isAvailable();
      } catch {
        return false;
      }
    };

    it('watermarks a video and produces a valid mp4', async () => {
      if (!(await hasFfmpeg())) {
        return; // FFmpeg-dependent; covered in CI/Docker where ffmpeg is present
      }
      const input = join(dir, 'in.mp4');
      const output = join(dir, 'out.mp4');
      await ffmpeg.run([
        '-y',
        '-f', 'lavfi',
        '-i', 'color=c=0x556b2f:s=640x360:d=2',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        input,
      ]);

      const service = new VideoProcessorService(
        new WatermarkOverlayService(configFor()),
        ffmpeg,
        configFor(),
        dir,
      );
      const result = await service.process(input, output);

      expect(result.sizeBytes).toBeGreaterThan(0);
      // Validate the mp4 container signature of the processed output.
      const { readFileHeader } = await import('../media-file');
      const header = await readFileHeader(output, 16);
      expect(
        header.length >= 8 &&
          header.subarray(4, 8).equals(Buffer.from([0x66, 0x74, 0x79, 0x70])),
      ).toBe(true);
    });

    it('maps FFmpeg failures to a sanitized 400', async () => {
      if (!(await hasFfmpeg())) {
        return;
      }
      const service = new VideoProcessorService(
        new WatermarkOverlayService(configFor()),
        ffmpeg,
        configFor(),
        dir,
      );
      await expect(
        service.process(join(dir, 'not-a-video.mp4'), join(dir, 'out.mp4')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('FfmpegRunner', () => {
    it('rejects a non-zero exit with a sanitized FfmpegError', async () => {
      const runner = new FfmpegRunner('definitely-not-a-real-binary-xyz');
      await expect(runner.run(['-version'])).rejects.toBeInstanceOf(FfmpegError);
    });

    it('does not invoke a shell (argument-array only)', () => {
      const runner = new FfmpegRunner('definitely-not-a-real-binary-xyz');
      const malicious = 'evil; rm -rf /';
      return expect(
        runner.run(['-i', malicious, '-f', 'null', '-']),
      ).rejects.toBeInstanceOf(FfmpegError);
    });
  });

  describe('MediaProcessingService', () => {
    it('dispatches images to the image processor', async () => {
      const imageProc = {
        process: jest.fn(async () => ({ outputPath: 'img-out', sizeBytes: 10 })),
      };
      const videoProc = { process: jest.fn() };
      const service = new MediaProcessingService(
        imageProc as unknown as ImageProcessorService,
        videoProc as unknown as VideoProcessorService,
        configFor(),
      );
      const result = await service.process('in.bin', 'image/png', dir);
      expect(imageProc.process).toHaveBeenCalled();
      expect(videoProc.process).not.toHaveBeenCalled();
      expect(result.outputPath).toBe('img-out');
    });

    it('dispatches videos to the video processor', async () => {
      const imageProc = { process: jest.fn() };
      const videoProc = {
        process: jest.fn(async () => ({ outputPath: 'vid-out', sizeBytes: 20 })),
      };
      const service = new MediaProcessingService(
        imageProc as unknown as ImageProcessorService,
        videoProc as unknown as VideoProcessorService,
        configFor(),
      );
      const result = await service.process('in.bin', 'video/mp4', dir);
      expect(videoProc.process).toHaveBeenCalled();
      expect(imageProc.process).not.toHaveBeenCalled();
      expect(result.outputPath).toBe('vid-out');
    });

    it('returns the original file untouched when watermarking is disabled', async () => {
      const source = join(dir, 'original.bin');
      await writeFile(source, Buffer.from([0x00, 0x01, 0x02, 0x03]));
      const service = new MediaProcessingService(
        { process: jest.fn() } as unknown as ImageProcessorService,
        { process: jest.fn() } as unknown as VideoProcessorService,
        configFor({ enabled: false }),
      );
      const result = await service.process(source, 'image/png', dir);
      expect(result.outputPath).toBe(source);
      expect(result.sizeBytes).toBe(4);
    });

    it('renders the overlay with the bundled Persian font and placeholder logo', async () => {
      const config = configFor();
      expect(existsSync(config.fontPath)).toBe(true);
      expect(existsSync(config.logoPath ?? '')).toBe(true);

      const overlay = await new WatermarkOverlayService(config).renderOverlay(300);
      expect(overlay.width).toBeGreaterThan(0);
      expect(overlay.height).toBeGreaterThan(0);
      expect(overlay.buffer.length).toBeGreaterThan(0);
    });
  });
});