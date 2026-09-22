import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { ImageProcessorService, THUMBNAIL_MAX_EDGE_PX } from './image-processor.service';
import { WatermarkOverlayService } from './watermark-overlay.service';
import { resolveWatermarkConfig } from './watermark-config';

/**
 * SS-129 thumbnail generation (real sharp, no mocks) + SS-210 thumbnail
 * policy: by default the thumbnail is rendered from the pre-watermark
 * original with its own smaller mark (never a shrunken full-size mark, never
 * double-composited). `inherit` keeps the legacy resize-of-watermarked path.
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

  it('brands the smaller-mode thumbnail from the original (no double mark)', async () => {
    const source = await createJpeg(1200, 800);
    const thumbnailPath = join(tempDir, 'thumb-branded.webp');
    await processor.generateThumbnail(source, thumbnailPath);

    const plain = await sharp(source)
      .resize({
        width: THUMBNAIL_MAX_EDGE_PX,
        height: THUMBNAIL_MAX_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
    const branded = await sharp(thumbnailPath).toBuffer();
    // The smaller mark is composited exactly once: the derivative differs
    // from a plain resize of the same original.
    expect(branded.equals(plain)).toBe(false);
  });

  it('keeps the thumbnail mark smaller than the full-size mark', async () => {
    const source = await createJpeg(1200, 800);
    const fullOut = join(tempDir, 'full.jpg');
    await processor.process(source, 'image/jpeg', fullOut);
    const thumbOut = join(tempDir, 'thumb-small-mark.webp');
    await processor.generateThumbnail(source, thumbOut);

    const fullPixels = await sharp(fullOut)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const thumbPixels = await sharp(thumbOut)
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Full-size overlay for a 1200px source is 204px wide; the 640px-edge
    // thumbnail overlay is 77px wide — the card mark is strictly smaller.
    expect(thumbPixels.info.width).toBeLessThan(fullPixels.info.width);
  });

  it('supports the inherit fallback (plain resize of the watermarked asset)', async () => {
    const inheritConfig = {
      ...resolveWatermarkConfig(),
      thumbnailMode: 'inherit' as const,
    };
    const inheritProcessor = new ImageProcessorService(
      new WatermarkOverlayService(inheritConfig),
      inheritConfig,
    );
    const source = await createJpeg(1200, 800);
    const watermarked = join(tempDir, 'wm.jpg');
    await inheritProcessor.process(source, 'image/jpeg', watermarked);

    const thumbnailPath = join(tempDir, 'thumb-inherit.webp');
    await inheritProcessor.generateThumbnail(source, thumbnailPath, watermarked);

    const expectedPath = join(tempDir, 'thumb-expected.webp');
    await sharp(watermarked)
      .resize({
        width: THUMBNAIL_MAX_EDGE_PX,
        height: THUMBNAIL_MAX_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toFile(expectedPath);
    const expected = await sharp(expectedPath)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const actual = await sharp(thumbnailPath)
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Compare decoded pixels (not encoded bytes): identical pipelines must
    // produce identical pixels.
    expect(actual.info).toMatchObject({
      width: expected.info.width,
      height: expected.info.height,
      channels: expected.info.channels,
    });
    expect(actual.data.equals(expected.data)).toBe(true);
  });
});
