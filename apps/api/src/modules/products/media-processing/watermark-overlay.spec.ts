import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import {
  chipSvg,
  hexToRgb,
  HORIZONTAL_THRESHOLD_PX,
  resolveLockup,
  WatermarkOverlayService,
} from './watermark-overlay.service';
import { resolveWatermarkConfig } from './watermark-config';

jest.setTimeout(60_000);

const WATERMARK_ENV_KEYS = [
  'WATERMARK_ENABLED',
  'WATERMARK_COMPANY_NAME',
  'WATERMARK_LOGO_PATH',
  'WATERMARK_FONT_PATH',
  'WATERMARK_OPACITY',
  'WATERMARK_POSITION',
  'WATERMARK_MARGIN_RATIO',
  'WATERMARK_SIZE_RATIO',
  'WATERMARK_MIN_SIZE_PX',
  'WATERMARK_MAX_SIZE_PX',
  'WATERMARK_TEXT_COLOR',
  'WATERMARK_CHIP_EDGE_COLOR',
  'WATERMARK_LOGO_BACKGROUND',
  'WATERMARK_LOCKUP',
  'WATERMARK_THUMBNAIL_MODE',
  'WATERMARK_THUMBNAIL_SIZE_RATIO',
  'WATERMARK_THUMBNAIL_MIN_SIZE_PX',
  'WATERMARK_THUMBNAIL_MAX_SIZE_PX',
];

function withCleanWatermarkEnv<T>(fn: () => T): T {
  const saved = new Map<string, string | undefined>();
  for (const key of WATERMARK_ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function configFor(overrides: Partial<ReturnType<typeof resolveWatermarkConfig>> = {}) {
  return { ...resolveWatermarkConfig(), ...overrides };
}

interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

async function rawPixels(buffer: Buffer): Promise<{ pixels: Pixel[]; width: number; height: number }> {
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels: Pixel[] = [];
  for (let i = 0; i < data.length; i += info.channels) {
    pixels.push({
      r: data[i] ?? 0,
      g: data[i + 1] ?? 0,
      b: data[i + 2] ?? 0,
      a: info.channels === 4 ? (data[i + 3] ?? 255) : 255,
    });
  }
  return { pixels, width: info.width, height: info.height };
}

describe('watermark dual-theme legibility (SS-210)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sabz-wm210-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('resolves dual-theme defaults and falls back on invalid env', () => {
    const config = withCleanWatermarkEnv(() => resolveWatermarkConfig());
    expect(config.opacity).toBe(0.38);
    expect(config.marginRatio).toBe(0.05);
    expect(config.sizeRatio).toBe(0.17);
    expect(config.minSizePx).toBe(100);
    expect(config.maxSizePx).toBe(240);
    expect(config.textColor).toBe('#F8F7F5');
    expect(config.lockup).toBe('auto');
    expect(config.logoPath?.endsWith('assets/brand/logo.png')).toBe(true);
    expect(config.thumbnailMode).toBe('smaller');
    expect(config.thumbnailSizeRatio).toBe(0.12);
    expect(config.thumbnailMinSizePx).toBe(64);
    expect(config.thumbnailMaxSizePx).toBe(140);
  });

  it('falls back to smaller thumbnails on invalid thumbnail env values', () => {
    process.env.WATERMARK_THUMBNAIL_MODE = 'diagonal';
    try {
      const config = resolveWatermarkConfig();
      expect(config.thumbnailMode).toBe('smaller');
    } finally {
      delete process.env.WATERMARK_THUMBNAIL_MODE;
    }
  });

  it('rejects invalid lockup and text-color env values', () => {
    process.env.WATERMARK_LOCKUP = 'diagonal';
    process.env.WATERMARK_TEXT_COLOR = 'not-a-color';
    try {
      const config = resolveWatermarkConfig();
      expect(config.lockup).toBe('auto');
      expect(config.textColor).toBe('#F8F7F5');
    } finally {
      delete process.env.WATERMARK_LOCKUP;
      delete process.env.WATERMARK_TEXT_COLOR;
    }
  });

  it('renders the company name in a light fill (readable on dark photos)', async () => {
    // Name-only lockup isolates the text: any bright pixel must be text.
    const overlay = await new WatermarkOverlayService(
      configFor({ logoPath: null }),
    ).renderOverlay(240);
    const { pixels } = await rawPixels(overlay.buffer);
    const bright = pixels.filter(
      (p) => p.a >= 128 && p.r >= 220 && p.g >= 220 && p.b >= 220,
    );
    expect(bright.length).toBeGreaterThan(50);
  });

  it('keeps the chip interior dark-translucent (contrast bed on light photos)', async () => {
    const overlayWidth = 160;
    const overlay = await new WatermarkOverlayService(configFor()).renderOverlay(
      overlayWidth,
    );
    const { data, info } = await sharp(overlay.buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Top-center of the chip padding band: pure chip, no logo/text/stroke.
    const padding = Math.round(overlayWidth * 0.14);
    const x = Math.floor(overlayWidth / 2);
    const y = Math.floor(padding / 2);
    const i = (y * info.width + x) * info.channels;
    const r = data[i] ?? -1;
    const g = data[i + 1] ?? -1;
    const b = data[i + 2] ?? -1;
    const a = data[i + 3] ?? -1;
    expect(Math.max(r, g, b)).toBeLessThanOrEqual(60);
    expect(a).toBeGreaterThanOrEqual(80);
    expect(a).toBeLessThanOrEqual(150);
  });

  it('renders a smaller horizontal lockup above the threshold', async () => {
    const service = new WatermarkOverlayService(configFor());
    const horizontal = await service.renderOverlay(240, 'horizontal');
    const vertical = await service.renderOverlay(240, 'vertical');
    expect(horizontal.width).toBe(240);
    expect(horizontal.height).toBeLessThan(vertical.height);
    expect(resolveLockup('auto', HORIZONTAL_THRESHOLD_PX)).toBe('horizontal');
    expect(resolveLockup('auto', HORIZONTAL_THRESHOLD_PX - 1)).toBe('vertical');
    expect(resolveLockup('vertical', 400)).toBe('vertical');
  });

  it('builds a stroked chip so the mark reads on near-black photos', () => {
    const svg = chipSvg(200, 100, 0.38, 'rgba(248,247,245,0.35)');
    expect(svg).toContain('stroke="rgba(248,247,245,0.35)"');
    expect(svg).toContain('rgba(20,26,22,0.38)');
    expect(hexToRgb('#F8F7F5')).toEqual({ r: 248, g: 247, b: 245 });
  });

  it('produces a valid overlay PNG for every lockup', async () => {
    const service = new WatermarkOverlayService(configFor());
    for (const lockup of ['auto', 'horizontal', 'vertical'] as const) {
      const overlay = await service.renderOverlay(200, lockup);
      const meta = await sharp(overlay.buffer).metadata();
      expect(meta.format).toBe('png');
      expect(meta.hasAlpha).toBe(true);
      expect(overlay.width).toBe(200);
      expect(overlay.height).toBeGreaterThan(0);
    }
  });
});
