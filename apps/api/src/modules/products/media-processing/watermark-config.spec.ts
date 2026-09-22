import {
  computeOverlayWidth,
  resolveWatermarkConfig,
  thumbnailOverlayWidthFor,
  watermarkOverlayWidthFor,
  watermarkVideoWidthExpr,
} from './watermark-config';

/**
 * SS-210 shared overlay sizing (`WatermarkSpec`): the sharp image processor
 * and the FFmpeg video filter expression derive from the same ratio/clamp
 * math so the mark stays proportional from tiny uploads to 4K video.
 */
describe('watermark shared sizing (SS-210)', () => {
  it('scales linearly with the source width inside the clamps', () => {
    // Default full-size spec: ratio 0.17, clamps 100..240.
    expect(computeOverlayWidth(1200, 0.17, 100, 240)).toBe(204);
    expect(computeOverlayWidth(1000, 0.17, 100, 240)).toBe(170);
  });

  it('floors small sources at the minimum', () => {
    expect(computeOverlayWidth(200, 0.17, 100, 240)).toBe(100);
    expect(computeOverlayWidth(0, 0.17, 100, 240)).toBe(100);
  });

  it('caps large sources at the maximum (through 4K widths)', () => {
    expect(computeOverlayWidth(1920, 0.17, 100, 240)).toBe(240);
    expect(computeOverlayWidth(3840, 0.17, 100, 240)).toBe(240);
  });

  it('derives the full-size overlay width from config', () => {
    const config = resolveWatermarkConfig();
    expect(watermarkOverlayWidthFor(1200, config)).toBe(
      computeOverlayWidth(1200, config.sizeRatio, config.minSizePx, config.maxSizePx),
    );
    expect(watermarkOverlayWidthFor(3840, config)).toBe(config.maxSizePx);
  });

  it('derives a strictly smaller thumbnail overlay from thumbnail clamps', () => {
    const config = resolveWatermarkConfig();
    // 1200px photo: full mark 204px, thumbnail (640px edge) mark ~77px.
    expect(thumbnailOverlayWidthFor(640, config)).toBe(
      computeOverlayWidth(
        640,
        config.thumbnailSizeRatio,
        config.thumbnailMinSizePx,
        config.thumbnailMaxSizePx,
      ),
    );
    expect(thumbnailOverlayWidthFor(640, config)).toBeLessThan(
      watermarkOverlayWidthFor(1200, config),
    );
    expect(thumbnailOverlayWidthFor(3840, config)).toBe(config.thumbnailMaxSizePx);
  });

  it('builds the FFmpeg scale2ref width expression from the shared clamps', () => {
    const config = resolveWatermarkConfig();
    expect(watermarkVideoWidthExpr(config)).toBe(
      'max(100,min(240,trunc(main_w*0.170/2)*2))',
    );
  });

  it('honors thumbnail env overrides', () => {
    process.env.WATERMARK_THUMBNAIL_MODE = 'inherit';
    process.env.WATERMARK_THUMBNAIL_SIZE_RATIO = '0.1';
    process.env.WATERMARK_THUMBNAIL_MIN_SIZE_PX = '48';
    process.env.WATERMARK_THUMBNAIL_MAX_SIZE_PX = '120';
    try {
      const config = resolveWatermarkConfig();
      expect(config.thumbnailMode).toBe('inherit');
      expect(config.thumbnailSizeRatio).toBe(0.1);
      expect(config.thumbnailMinSizePx).toBe(48);
      expect(config.thumbnailMaxSizePx).toBe(120);
    } finally {
      delete process.env.WATERMARK_THUMBNAIL_MODE;
      delete process.env.WATERMARK_THUMBNAIL_SIZE_RATIO;
      delete process.env.WATERMARK_THUMBNAIL_MIN_SIZE_PX;
      delete process.env.WATERMARK_THUMBNAIL_MAX_SIZE_PX;
    }
  });
});
