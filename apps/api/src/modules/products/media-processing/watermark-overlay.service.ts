import { Inject, Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import sharp from 'sharp';
import {
  WATERMARK_CHIP_RGB,
  WATERMARK_CONFIG,
  WatermarkConfig,
  WatermarkLockup,
} from './watermark-config';

export interface OverlayRender {
  buffer: Buffer;
  width: number;
  height: number;
}

/** Layers accepted by the final sharp composite (structural subset). */
interface CompositeLayer {
  input: Buffer;
  left?: number;
  top?: number;
  blend?: 'over' | 'dest-in';
}

/** Padding inside the chip, as a fraction of the overlay width. */
const CHIP_PADDING_RATIO = 0.14;
/** Gap between the logo and the company name, as a fraction of overlay width. */
const LOGO_TEXT_GAP_RATIO = 0.08;
/** Logo width inside the chip for the stacked lockup, as a fraction of inner width. */
const LOGO_WIDTH_RATIO = 0.7;
/** Logo side for the horizontal lockup, as a fraction of inner width. */
const HORIZONTAL_LOGO_RATIO = 0.3;
/** At/above this overlay width `auto` picks the horizontal lockup. */
export const HORIZONTAL_THRESHOLD_PX = 220;
/** Company name text drawn on a chip 2x wider than the requested text size. */
const TEXT_RENDER_SCALE = 2;

/** Resolves the effective lockup for a requested overlay width. */
export function resolveLockup(
  lockup: WatermarkLockup,
  overlayWidth: number,
): 'horizontal' | 'vertical' {
  if (lockup !== 'auto') {
    return lockup;
  }
  return overlayWidth >= HORIZONTAL_THRESHOLD_PX ? 'horizontal' : 'vertical';
}

/** Parses a `#rrggbb` color into its channels (config values are validated). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/**
 * Pure chip background SVG: a dark translucent rounded rect with a thin
 * light edge. The dark fill occludes the photo behind it (so the light text
 * reads on light studio shots) while the light edge keeps the chip itself
 * visible on near-black photos.
 */
export function chipSvg(
  width: number,
  height: number,
  opacity: number,
  edgeColor: string,
): string {
  const radius = Math.round(Math.min(width, height) * 0.2);
  const edgeWidth = Math.max(1, Math.round(Math.min(width, height) * 0.01));
  const fill = `rgba(${WATERMARK_CHIP_RGB},${opacity})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect x="${edgeWidth / 2}" y="${edgeWidth / 2}" width="${width - edgeWidth}" height="${height - edgeWidth}" rx="${radius}" fill="${fill}" stroke="${edgeColor}" stroke-width="${edgeWidth}"/>
    </svg>`;
}

/**
 * Renders the company watermark lockup (logo + company name) into a single
 * transparent PNG overlay that the image processor (sharp composite) and the
 * video processor (FFmpeg overlay) both consume.
 *
 * The lockup is a rounded, semi-transparent dark "chip" with light text, a
 * light edge and an opaque pill behind the logo, so the mark stays legible
 * on both light-background studio shots and dark product photos. Text is
 * rendered with libvips' Pango text support using the bundled Vazirmatn
 * font, so the Persian name renders identically on any host without
 * installing system fonts.
 */
@Injectable()
export class WatermarkOverlayService {
  private readonly logger = new Logger(WatermarkOverlayService.name);

  constructor(
    @Inject(WATERMARK_CONFIG) private readonly config: WatermarkConfig,
  ) {}

  /**
   * Renders the overlay at the requested width in pixels. Returns a PNG buffer
   * with the natural overlay dimensions so callers can position it exactly.
   * `lockupOverride` is for tests; production passes nothing (`auto`).
   */
  async renderOverlay(
    overlayWidth: number,
    lockupOverride?: WatermarkLockup,
  ): Promise<OverlayRender> {
    const lockup = resolveLockup(lockupOverride ?? this.config.lockup, overlayWidth);
    const layers =
      lockup === 'horizontal'
        ? await this.renderHorizontal(overlayWidth)
        : await this.renderVertical(overlayWidth);

    const buffer = await sharp({
      create: {
        width: layers.width,
        height: layers.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(layers.inputs)
      .png()
      .toBuffer();

    return { buffer, width: layers.width, height: layers.height };
  }

  private async renderVertical(overlayWidth: number): Promise<{
    width: number;
    height: number;
    inputs: CompositeLayer[];
  }> {
    const padding = Math.round(overlayWidth * CHIP_PADDING_RATIO);
    const gap = Math.round(overlayWidth * LOGO_TEXT_GAP_RATIO);
    const innerWidth = overlayWidth - padding * 2;

    const logo = await this.renderLogo(Math.round(innerWidth * LOGO_WIDTH_RATIO));
    const text = await this.renderText(innerWidth);

    const logoHeight = logo?.height ?? 0;
    const chipHeight = padding + logoHeight + (logo ? gap : 0) + text.height + padding;
    const chipBackground = await this.renderChip(overlayWidth, chipHeight);

    return {
      width: overlayWidth,
      height: chipHeight,
      inputs: [
        { input: chipBackground },
        ...(logo
          ? [
              {
                input: logo.buffer,
                left: Math.round((overlayWidth - logo.width) / 2),
                top: padding,
              },
            ]
          : []),
        {
          input: text.buffer,
          left: Math.round((overlayWidth - text.width) / 2),
          top: padding + logoHeight + (logo ? gap : 0),
        },
      ],
    };
  }

  private async renderHorizontal(overlayWidth: number): Promise<{
    width: number;
    height: number;
    inputs: CompositeLayer[];
  }> {
    const padding = Math.round(overlayWidth * CHIP_PADDING_RATIO);
    const gap = Math.round(overlayWidth * LOGO_TEXT_GAP_RATIO);
    const innerWidth = overlayWidth - padding * 2;

    // RTL reading order: the mark sits at the inline-start (right side),
    // the company name flows to its left.
    const logo = await this.renderLogo(Math.round(innerWidth * HORIZONTAL_LOGO_RATIO));
    const logoWidth = logo?.width ?? 0;
    const logoHeight = logo?.height ?? 0;
    const textSlot = Math.max(48, innerWidth - logoWidth - (logo ? gap : 0));
    const text = await this.renderText(textSlot);

    const contentHeight = Math.max(logoHeight, text.height);
    const chipHeight = contentHeight + padding * 2;
    const chipBackground = await this.renderChip(overlayWidth, chipHeight);

    const logoLeft = overlayWidth - padding - logoWidth;
    const textLeft = padding + Math.round((textSlot - text.width) / 2);
    const logoTop = padding + Math.round((contentHeight - logoHeight) / 2);
    const textTop = padding + Math.round((contentHeight - text.height) / 2);

    return {
      width: overlayWidth,
      height: chipHeight,
      inputs: [
        { input: chipBackground },
        ...(logo
          ? [{ input: logo.buffer, left: logoLeft, top: logoTop }]
          : []),
        { input: text.buffer, left: textLeft, top: textTop },
      ],
    };
  }

  /**
   * Renders the logo onto an opaque light pill so dark logo regions stay
   * visible against the dark chip. Returns null when no logo asset is
   * configured (name-only lockup).
   */
  private async renderLogo(targetWidth: number): Promise<OverlayRender | null> {
    if (!this.config.logoPath || !existsSync(this.config.logoPath)) {
      if (this.config.logoPath) {
        this.logger.warn(
          `Watermark logo not found at ${this.config.logoPath}; using name-only lockup.`,
        );
      }
      return null;
    }
    const raw = await sharp(this.config.logoPath)
      .resize({
        width: targetWidth,
        height: Math.round(targetWidth),
        fit: 'contain',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    const meta = await sharp(raw).metadata();
    const logoWidth = meta.width ?? targetWidth;
    const logoHeight = meta.height ?? targetWidth;

    const pad = Math.max(2, Math.round(targetWidth * 0.08));
    const backWidth = logoWidth + pad * 2;
    const backHeight = logoHeight + pad * 2;
    const { r, g, b } = hexToRgb(this.config.logoBackground);
    const backing = await sharp({
      create: {
        width: backWidth,
        height: backHeight,
        channels: 4,
        background: { r, g, b, alpha: 1 },
      },
    })
      .composite([{ input: raw, left: pad, top: pad }])
      .png()
      .toBuffer();
    const backingMeta = await sharp(backing).metadata();
    return {
      buffer: backing,
      width: backingMeta.width ?? backWidth,
      height: backingMeta.height ?? backHeight,
    };
  }

  /**
   * Renders the company name in the configured (light) text color. Sharp's
   * Pango text has no fill option, so the name is rendered as a black mask
   * and recolored through a solid canvas with `dest-in` compositing, which
   * preserves antialiased edges.
   */
  private async renderText(maxWidth: number): Promise<OverlayRender> {
    // Render at 2x then downscale for crisp text on high-DPI displays and
    // when the video pipeline upscales the overlay.
    const width = Math.max(64, Math.max(48, maxWidth) * TEXT_RENDER_SCALE);
    const buffer = await sharp({
      text: {
        text: this.config.companyName,
        fontfile: this.config.fontPath,
        font: 'Vazirmatn',
        rgba: true,
        align: 'center',
        width,
        dpi: 300,
      },
    })
      .png()
      .toBuffer();

    const meta = await sharp(buffer).metadata();
    const naturalWidth = meta.width ?? width;
    const naturalHeight = meta.height ?? Math.round(width / 4);

    // Crop the Pango output to the actual text bounds, then scale to maxWidth.
    const cropped = await sharp(buffer)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize({ width: Math.max(48, maxWidth), withoutEnlargement: false })
      .png()
      .toBuffer();
    const croppedMeta = await sharp(cropped).metadata();
    const finalWidth = croppedMeta.width ?? maxWidth;
    const finalHeight =
      croppedMeta.height ?? Math.round((naturalHeight / naturalWidth) * maxWidth);

    const { r, g, b } = hexToRgb(this.config.textColor);
    const recolored = await sharp({
      create: {
        width: finalWidth,
        height: finalHeight,
        channels: 4,
        background: { r, g, b, alpha: 1 },
      },
    })
      .composite([{ input: cropped, blend: 'dest-in' }])
      .png()
      .toBuffer();

    return { buffer: recolored, width: finalWidth, height: finalHeight };
  }

  private async renderChip(width: number, height: number): Promise<Buffer> {
    const svg = chipSvg(width, height, this.config.opacity, this.config.chipEdgeColor);
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
}
