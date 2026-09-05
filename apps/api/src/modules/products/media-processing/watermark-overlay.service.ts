import { Inject, Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import sharp from 'sharp';
import { WATERMARK_CONFIG, WatermarkConfig } from './watermark-config';

export interface OverlayRender {
  buffer: Buffer;
  width: number;
  height: number;
}

/** Padding inside the chip, as a fraction of the overlay width. */
const CHIP_PADDING_RATIO = 0.14;
/** Gap between the logo and the company name, as a fraction of overlay width. */
const LOGO_TEXT_GAP_RATIO = 0.1;
/** Logo width inside the chip, as a fraction of the inner width. */
const LOGO_WIDTH_RATIO = 0.7;
/** Company name text drawn on a chip 2x wider than the requested text size. */
const TEXT_RENDER_SCALE = 2;

/**
 * Renders the company watermark lockup (logo + company name) into a single
 * transparent PNG overlay that the image processor (sharp composite) and the
 * video processor (FFmpeg overlay) both consume.
 *
 * The lockup is a rounded, semi-transparent "chip": logo above, company name
 * below. Rendering the chip keeps the mark legible on any product photo and
 * makes the size/opacity deterministic across image and video pipelines. Text
 * is rendered with libvips' Pango text support using the bundled Vazirmatn
 * font, so the Persian name renders identically on any host without installing
 * system fonts.
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
   */
  async renderOverlay(overlayWidth: number): Promise<OverlayRender> {
    const padding = Math.round(overlayWidth * CHIP_PADDING_RATIO);
    const gap = Math.round(overlayWidth * LOGO_TEXT_GAP_RATIO);
    const innerWidth = overlayWidth - padding * 2;

    const logo = await this.renderLogo(Math.round(innerWidth * LOGO_WIDTH_RATIO));
    const text = await this.renderText(innerWidth);

    const logoHeight = logo?.height ?? 0;
    const chipHeight = padding + logoHeight + (logo ? gap : 0) + text.height + padding;

    const chipBackground = await this.renderChip(overlayWidth, chipHeight);

    const layers = [
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
    ];

    const buffer = await sharp({
      create: {
        width: overlayWidth,
        height: chipHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(layers)
      .png()
      .toBuffer();

    return { buffer, width: overlayWidth, height: chipHeight };
  }

  private async renderLogo(targetWidth: number): Promise<OverlayRender | null> {
    if (!this.config.logoPath || !existsSync(this.config.logoPath)) {
      if (this.config.logoPath) {
        this.logger.warn(
          `Watermark logo not found at ${this.config.logoPath}; using name-only lockup.`,
        );
      }
      return null;
    }
    const buffer = await sharp(this.config.logoPath)
      .resize({
        width: targetWidth,
        height: Math.round(targetWidth),
        fit: 'contain',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    return { buffer, width: meta.width ?? targetWidth, height: meta.height ?? targetWidth };
  }

  private async renderText(maxWidth: number): Promise<OverlayRender> {
    // Render at 2x then downscale for crisp text on high-DPI displays and
    // when the video pipeline upscales the overlay.
    const width = Math.max(64, maxWidth * TEXT_RENDER_SCALE);
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
      .resize({ width: maxWidth, withoutEnlargement: false })
      .png()
      .toBuffer();
    const croppedMeta = await sharp(cropped).metadata();

    return {
      buffer: cropped,
      width: croppedMeta.width ?? maxWidth,
      height: croppedMeta.height ?? Math.round((naturalHeight / naturalWidth) * maxWidth),
    };
  }

  private async renderChip(width: number, height: number): Promise<Buffer> {
    const radius = Math.round(Math.min(width, height) * 0.22);
    const fill = `rgba(20,26,22,${this.config.opacity})`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" rx="${radius}" fill="${fill}"/>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
}