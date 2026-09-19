import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { ImageProcessorService, THUMBNAIL_MAX_EDGE_PX } from './image-processor.service';
import { WatermarkOverlayService } from './watermark-overlay.service';
import { resolveWatermarkConfig } from './watermark-config';

/**
 * SS-129 thumbnail generation (real sharp, no mocks): the thumbnail is a WEBP
 * resize of the already-watermarked asset, capped at THUMBNAIL_MAX_EDGE_PX on
 * its longest edge and never enlarged.
 */
describe('ImageProcessorService.generateThumbnail (SS-129)', () => {
  let processor: ImageProcessorService;
  let tempDir: string;

  beforeAll(() => {
    processor = new ImageProcessorService(
      new WatermarkOverlayService(resolveWatermarkConfig()),
      resolveWatermarkConfig(),
    );
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'thumb-spec-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createJpeg(width: number, height: number): Promise<string> {
    const path = join(tempDir, `source-${width}x${height}.jpg`);
    await sharp({
      create: { width, height, channels: 3, background: { r: 90, g: 140, b: 90 } },
    })
      .jpeg()
      .toFile(path);
    return path;
  }

  it('produces a WEBP thumbnail capped at the max edge for a landscape image', async () => {
    const source = await createJpeg(1200, 800);
    const thumbnailPath = join(tempDir, 'thumb.webp');

    const result = await processor.generateThumbnail(source, thumbnailPath);

    const metadata = await sharp(result.thumbnailPath).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(THUMBNAIL_MAX_EDGE_PX);
    expect(metadata.height).toBeLessThanOrEqual(THUMBNAIL_MAX_EDGE_PX);
    // Longest edge is exactly the cap (downscaled, not enlarged).
    expect(metadata.width).toBe(THUMBNAIL_MAX_EDGE_PX);
    const sourceSize = (await stat(source)).size;
    expect(result.thumbnailSizeBytes).toBe(await stat(result.thumbnailPath).then((s) => s.size));
    expect(result.thumbnailSizeBytes).toBeLessThan(sourceSize);
  });

  it('never enlarges a small image', async () => {
    const source = await createJpeg(320, 200);
    const thumbnailPath = join(tempDir, 'thumb-small.webp');

    const result = await processor.generateThumbnail(source, thumbnailPath);

    const metadata = await sharp(result.thumbnailPath).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(320);
    expect(metadata.height).toBe(200);
  });

  it('caps the height of a portrait image', async () => {
    const source = await createJpeg(600, 1400);
    const thumbnailPath = join(tempDir, 'thumb-portrait.webp');

    await processor.generateThumbnail(source, thumbnailPath);

    const metadata = await sharp(thumbnailPath).metadata();
    expect(metadata.height).toBe(THUMBNAIL_MAX_EDGE_PX);
    expect(metadata.width).toBeLessThanOrEqual(THUMBNAIL_MAX_EDGE_PX);
  });

  it('rejects non-image sources with a 400', async () => {
    const notAnImage = join(tempDir, 'garbage.bin');
    await (await import('fs/promises')).writeFile(notAnImage, Buffer.from('not an image'));
    await expect(
      processor.generateThumbnail(notAnImage, join(tempDir, 'out.webp')),
    ).rejects.toThrow();
  });
});
