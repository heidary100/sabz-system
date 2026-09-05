import { resolve } from 'path';

/**
 * Centralized company watermark/branding configuration (SS-105 + CATALOG-007).
 *
 * The customer-facing product media pipeline watermarks every image and video
 * with the company logo + company name. All branding parameters live here so
 * the company can change the logo asset, displayed name, opacity, position and
 * sizing in one place without touching the image/video processors.
 *
 * Branding sources:
 *   - Logo:  `apps/api/assets/watermark/logo-placeholder.svg` by default
 *            (the client's official logo replaces this file, or
 *            `WATERMARK_LOGO_PATH` points at the new asset).
 *   - Font:  `apps/api/assets/watermark/fonts/Vazirmatn-Regular.ttf` is
 *            bundled so the Persian company name renders identically in local
 *            dev, Docker and CI regardless of the host's installed fonts.
 *
 * Paths are resolved relative to the API working directory (apps/api), which
 * matches how the media storage default directories are resolved.
 */

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
}

function defaultLogoPath(): string {
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

/** Builds the watermark configuration from the process environment. */
export function resolveWatermarkConfig(): WatermarkConfig {
  const position = env('WATERMARK_POSITION', 'bottom-right');
  const allowedPositions: WatermarkConfig['position'][] = [
    'bottom-right',
    'bottom-left',
    'top-right',
    'top-left',
  ];
  return {
    enabled: env('WATERMARK_ENABLED', 'true') === 'true',
    companyName: env('WATERMARK_COMPANY_NAME', 'سبز سیستم'),
    logoPath: env('WATERMARK_LOGO_PATH', '') !== ''
      ? resolve(env('WATERMARK_LOGO_PATH', ''))
      : defaultLogoPath(),
    fontPath: resolve(env('WATERMARK_FONT_PATH', defaultFontPath())),
    opacity: Math.min(1, Math.max(0, envNumber('WATERMARK_OPACITY', 0.55))),
    marginRatio: envNumber('WATERMARK_MARGIN_RATIO', 0.04),
    sizeRatio: Math.min(1, Math.max(0, envNumber('WATERMARK_SIZE_RATIO', 0.3))),
    minSizePx: envNumber('WATERMARK_MIN_SIZE_PX', 140),
    maxSizePx: envNumber('WATERMARK_MAX_SIZE_PX', 360),
    position: (allowedPositions as string[]).includes(position)
      ? (position as WatermarkConfig['position'])
      : 'bottom-right',
  };
}

/** Constants shared by the image and video watermark processors. */
export const WATERMARK = Symbol('WATERMARK');
export const WATERMARK_CONFIG = Symbol('WATERMARK_CONFIG');