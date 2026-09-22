import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Centralized company watermark/branding configuration (SS-105 + CATALOG-007,
 * dual-theme legibility SS-210).
 *
 * The customer-facing product media pipeline watermarks every image and video
 * with the company logo + company name. All branding parameters live here so
 * the company can change the logo asset, displayed name, opacity, position and
 * sizing in one place without touching the image/video processors.
 *
 * Branding sources:
 *   - Logo:  `apps/api/assets/brand/logo.png` by default (SS-209 central
 *            brand asset — the real company mark, 141px RGBA; the client's
 *            official logo replaces this file, or `WATERMARK_LOGO_PATH`
 *            points at the new asset). The legacy
 *            `assets/watermark/logo-placeholder.svg` is kept as a fallback.
 *   - Font:  `apps/api/assets/watermark/fonts/Vazirmatn-Regular.ttf` is
 *            bundled so the Persian company name renders identically in local
 *            dev, Docker and CI regardless of the host's installed fonts.
 *
 * Dual-theme legibility (SS-210): the overlay is a dark translucent chip, so
 * the company name is rendered in a light fill with a light chip edge and an
 * opaque pill behind the logo. The mark therefore reads on both
 * light-background studio shots and near-black product photos.
 *
 * Paths are resolved relative to the API working directory (apps/api), which
 * matches how the media storage default directories are resolved.
 */

export type WatermarkLockup = 'auto' | 'horizontal' | 'vertical';

/**
 * Listing-thumbnail watermark policy (SS-210, audit Q6 decided: smaller mark).
 *
 * - `smaller`: the thumbnail is rendered from the pre-watermark original with
 *   its own smaller overlay (thumbnail ratio/clamps), so listing cards carry
 *   a subtle brand instead of the shrunken full-size mark.
 * - `inherit`: legacy fallback — the thumbnail is a plain resize of the
 *   already-watermarked asset. Kept for env override / rollback only.
 *
 * Existing stored assets keep their old marks in both modes (no retroactive
 * reprocessing — recorded #182 decision).
 */
export type WatermarkThumbnailMode = 'smaller' | 'inherit';

export interface WatermarkConfig {
  /** Master switch; when off, uploaded media is stored as-is (no branding). */
  enabled: boolean;
  /** Displayed company name, e.g. «سبز سیستم». */
  companyName: string;
  /** Logo asset path (SVG or PNG). `null` renders the name-only lockup. */
  logoPath: string | null;
  /** TTF/OTF used to render `companyName` deterministically. */
  fontPath: string;
  /** Background chip opacity 0..1 (keeps the mark legible on any image). */
  opacity: number;
  /** Distance from the corner, as a fraction of the media's shorter side. */
  marginRatio: number;
  /** Overlay width as a fraction of the media width (0..1). */
  sizeRatio: number;
  /** Clamp for the rendered overlay width in pixels (images). */
  minSizePx: number;
  maxSizePx: number;
  /** Placement corner: 'bottom-right' is the default professional position. */
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Company-name text fill, `#rrggbb`. Light by default (dark chip). */
  textColor: string;
  /** Thin light edge around the chip so it reads on near-black photos. */
  chipEdgeColor: string;
  /** Opaque pill behind the logo so dark logo regions survive the dark chip. */
  logoBackground: string;
  /**
   * Lockup layout. `auto` renders the horizontal (logo-inline) lockup at
   * normal sizes and the stacked vertical lockup for narrow overlays.
   */
  lockup: WatermarkLockup;
  /**
   * Thumbnail policy (`smaller` default). See `WatermarkThumbnailMode`.
   * The thumbnail overlay uses its own ratio/clamps below, sized from the
   * *thumbnail* width — never a shrunken copy of the full-size mark.
   */
  thumbnailMode: WatermarkThumbnailMode;
  /** Overlay width as a fraction of the thumbnail width (0..1). */
  thumbnailSizeRatio: number;
  /** Clamp for the rendered thumbnail overlay width in pixels. */
  thumbnailMinSizePx: number;
  thumbnailMaxSizePx: number;
}

/** Light off-white used for watermark text/edges (brand background). */
export const WATERMARK_LIGHT = '#F8F7F5';
/** Dark chip base (alpha comes from `opacity`). */
export const WATERMARK_CHIP_RGB = '20,26,22';

function defaultLogoPath(): string {
  const branded = resolve(process.cwd(), 'assets/brand/logo.png');
  if (existsSync(branded)) {
    return branded;
  }
  return resolve(process.cwd(), 'assets/watermark/logo-placeholder.svg');
}

function defaultFontPath(): string {
  return resolve(process.cwd(), 'assets/watermark/fonts/Vazirmatn-Regular.ttf');
}

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function envHex(name: string, fallback: string): string {
  const value = env(name, fallback);
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

/** Builds the watermark configuration from the process environment. */
export function resolveWatermarkConfig(): WatermarkConfig {
  const position = env('WATERMARK_POSITION', 'bottom-right');
  const allowedPositions: WatermarkConfig['position'][] = [
    'bottom-right',
    'bottom-left',
    'top-right',
    'top-left',
  ];
  const lockup = env('WATERMARK_LOCKUP', 'auto');
  const allowedLockups: WatermarkLockup[] = ['auto', 'horizontal', 'vertical'];
  const thumbnailMode = env('WATERMARK_THUMBNAIL_MODE', 'smaller');
  const allowedThumbnailModes: WatermarkThumbnailMode[] = ['smaller', 'inherit'];
  return {
    enabled: env('WATERMARK_ENABLED', 'true') === 'true',
    companyName: env('WATERMARK_COMPANY_NAME', 'سبز سیستم'),
    logoPath: env('WATERMARK_LOGO_PATH', '') !== ''
      ? resolve(env('WATERMARK_LOGO_PATH', ''))
      : defaultLogoPath(),
    fontPath: resolve(env('WATERMARK_FONT_PATH', defaultFontPath())),
    opacity: Math.min(1, Math.max(0, envNumber('WATERMARK_OPACITY', 0.38))),
    marginRatio: envNumber('WATERMARK_MARGIN_RATIO', 0.05),
    sizeRatio: Math.min(1, Math.max(0, envNumber('WATERMARK_SIZE_RATIO', 0.17))),
    minSizePx: envNumber('WATERMARK_MIN_SIZE_PX', 100),
    maxSizePx: envNumber('WATERMARK_MAX_SIZE_PX', 240),
    position: (allowedPositions as string[]).includes(position)
      ? (position as WatermarkConfig['position'])
      : 'bottom-right',
    textColor: envHex('WATERMARK_TEXT_COLOR', WATERMARK_LIGHT),
    chipEdgeColor: env('WATERMARK_CHIP_EDGE_COLOR', 'rgba(248,247,245,0.35)'),
    logoBackground: envHex('WATERMARK_LOGO_BACKGROUND', WATERMARK_LIGHT),
    lockup: (allowedLockups as string[]).includes(lockup)
      ? (lockup as WatermarkLockup)
      : 'auto',
    thumbnailMode: (allowedThumbnailModes as string[]).includes(thumbnailMode)
      ? (thumbnailMode as WatermarkThumbnailMode)
      : 'smaller',
    thumbnailSizeRatio: Math.min(
      1,
      Math.max(0, envNumber('WATERMARK_THUMBNAIL_SIZE_RATIO', 0.12)),
    ),
    thumbnailMinSizePx: envNumber('WATERMARK_THUMBNAIL_MIN_SIZE_PX', 64),
    thumbnailMaxSizePx: envNumber('WATERMARK_THUMBNAIL_MAX_SIZE_PX', 140),
  };
}

/**
 * Shared overlay-width math (SS-210 `WatermarkSpec`): clamps
 * `sourceWidthPx * sizeRatio` into `[minSizePx, maxSizePx]`. Both the sharp
 * image processor and the FFmpeg video filter expression derive from here so
 * the mark stays proportional from tiny uploads to 4K video.
 */
export function computeOverlayWidth(
  sourceWidthPx: number,
  sizeRatio: number,
  minSizePx: number,
  maxSizePx: number,
): number {
  return Math.round(
    Math.min(maxSizePx, Math.max(minSizePx, sourceWidthPx * sizeRatio)),
  );
}

/** Full-size overlay width for a source image/video width. */
export function watermarkOverlayWidthFor(
  sourceWidthPx: number,
  config: Pick<WatermarkConfig, 'sizeRatio' | 'minSizePx' | 'maxSizePx'>,
): number {
  return computeOverlayWidth(
    sourceWidthPx,
    config.sizeRatio,
    config.minSizePx,
    config.maxSizePx,
  );
}

/** Thumbnail overlay width for a rendered thumbnail width. */
export function thumbnailOverlayWidthFor(
  thumbnailWidthPx: number,
  config: Pick<
    WatermarkConfig,
    'thumbnailSizeRatio' | 'thumbnailMinSizePx' | 'thumbnailMaxSizePx'
  >,
): number {
  return computeOverlayWidth(
    thumbnailWidthPx,
    config.thumbnailSizeRatio,
    config.thumbnailMinSizePx,
    config.thumbnailMaxSizePx,
  );
}

/**
 * FFmpeg `scale2ref` width expression sizing the video mark from the video
 * width (`main_w`) with the shared ratio/clamps. Values are server-side
 * numerics (ratio to 3 decimals, integer clamps), never client input.
 */
export function watermarkVideoWidthExpr(
  config: Pick<WatermarkConfig, 'sizeRatio' | 'minSizePx' | 'maxSizePx'>,
): string {
  const ratio = config.sizeRatio.toFixed(3);
  const minPx = Math.round(config.minSizePx);
  const maxPx = Math.round(config.maxSizePx);
  return `max(${minPx},min(${maxPx},trunc(main_w*${ratio}/2)*2))`;
}

/** Constants shared by the image and video watermark processors. */
export const WATERMARK = Symbol('WATERMARK');
export const WATERMARK_CONFIG = Symbol('WATERMARK_CONFIG');
