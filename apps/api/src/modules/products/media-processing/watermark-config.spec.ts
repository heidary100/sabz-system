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
const WATERMARK_ENV_KEYS = [
  'WATERMARK_SIZE_RATIO',
  'WATERMARK_MIN_SIZE_PX',
  'WATERMARK_MAX_SIZE_PX',
  'WATERMARK_THUMBNAIL_SIZE_RATIO',
  'WATERMARK_THUMBNAIL_MIN_SIZE_PX',
  'WATERMARK_THUMBNAIL_MAX_SIZE_PX',
] as const;

describe('watermark shared sizing (SS-210)', () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of WATERMARK_ENV_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of WATERMARK_ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    saved.clear();
  });

  it('defaults to the revised smaller logo-only mark', () => {
    const config = resolveWatermarkConfig();
    expect(config.logoOnly).toBe(true);
    expect(config.sizeRatio).toBe(0.15);
    expect(config.minSizePx).toBe(90);
    expect(config.maxSizePx).toBe(210);
    expect(config.thumbnailSizeRatio).toBe(0.1);
    expect(config.thumbnailMinSizePx).toBe(56);
    expect(config.thumbnailMaxSizePx).toBe(120);
    // Strictly smaller than the previous 0.17 / 100–240 specification.
    expect(config.sizeRatio).toBeLessThan(0.17);
    expect(config.maxSizePx).toBeLessThan(240);
  });

  it('scales linearly with the source width inside the clamps', () => {
    // Pure sizing math (values are inputs, not the current defaults).
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
    // 1200px photo: full mark ~180px, thumbnail (640px edge) mark ~64px.
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
      'max(90,min(210,trunc(main_w*0.150/2)*2))',
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
