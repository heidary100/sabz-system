import { WatermarkConfig } from './watermark-config';

export interface WatermarkOffset {
  left: number;
  top: number;
}

/**
 * Computes the overlay position for a target media of the given dimensions.
 * Shared by the sharp image processor and used to build the FFmpeg overlay
 * filter expression for videos. The margin is a fraction of the media's
 * shorter side so placement scales consistently across portrait/landscape/
 * square assets.
 */
export function watermarkOffsetFor(
  config: Pick<WatermarkConfig, 'position' | 'marginRatio'>,
  targetWidth: number,
  targetHeight: number,
  overlayWidth: number,
  overlayHeight: number,
): WatermarkOffset {
  const margin = Math.round(
    Math.min(targetWidth, targetHeight) * config.marginRatio,
  );

  const leftOnRight =
    Math.max(0, targetWidth - overlayWidth - margin);
  const topOnBottom =
    Math.max(0, targetHeight - overlayHeight - margin);

  switch (config.position) {
    case 'bottom-left':
      return { left: margin, top: topOnBottom };
    case 'top-right':
      return { left: leftOnRight, top: margin };
    case 'top-left':
      return { left: margin, top: margin };
    case 'bottom-right':
    default:
      return { left: leftOnRight, top: topOnBottom };
  }
}

/** FFmpeg overlay `x`/`y` expression for the configured corner + margin. */
export function watermarkFilterPosition(
  config: Pick<WatermarkConfig, 'position' | 'marginRatio'>,
): { x: string; y: string } {
  const main = {
    right: 'main_w-overlay_w',
    bottom: 'main_h-overlay_h',
    left: '0',
    top: '0',
  };
  const marginExpr = (base: string): string =>
    `${base}-round(main_h*${config.marginRatio})`;

  switch (config.position) {
    case 'bottom-left':
      return { x: `round(main_h*${config.marginRatio})`, y: marginExpr(main.bottom) };
    case 'top-right':
      return { x: marginExpr(main.right), y: `round(main_h*${config.marginRatio})` };
    case 'top-left':
      return {
        x: `round(main_h*${config.marginRatio})`,
        y: `round(main_h*${config.marginRatio})`,
      };
    case 'bottom-right':
    default:
      return { x: marginExpr(main.right), y: marginExpr(main.bottom) };
  }
}