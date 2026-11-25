import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type * as Ort from 'onnxruntime-node';
import sharp from 'sharp';

type OrtModule = typeof import('onnxruntime-node');

function loadOrt(): OrtModule {
  // Lazy native module load: a host/image without onnxruntime installed must
  // not prevent the API from starting; uploads then fall back safely.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('onnxruntime-node') as OrtModule;
}

export interface BackgroundRemovalResult {
  buffer: Buffer;
  width: number;
  height: number;
  backgroundRemoved: boolean;
  model: string;
  coverage: number;
  alphaBBox: { left: number; top: number; width: number; height: number };
  canvasSize: number;
  durationMs: number;
  skippedReason?: 'ALREADY_TRANSPARENT' | 'DISABLED';
}

export class BackgroundRemovalQualityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackgroundRemovalQualityError';
  }
}

export class BackgroundRemovalUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackgroundRemovalUnavailableError';
  }
}

const MODEL_INPUT = 320;
const MODEL_VERSION = 'u2net-onnx-1.0';
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

/**
 * Local product background removal (SS-900).
 *
 * U2-Net (Apache-2.0) runs through onnxruntime-node on CPU. Model weights are
 * provisioned locally by `scripts/provision-background-model.mjs`; runtime
 * inference never calls a remote service or inference API. The model path,
 * input size and quality gates are configuration, not client input.
 *
 * Quality posture: mask min/max normalization, soft alpha, 0.5px edge
 * smoothing, source-bbox cropping (never product cropping), square transparent
 * canvas with a balanced margin, and hard coverage gates. A failed gate throws
 * so the caller keeps the original instead of publishing a damaged derivative.
 */
@Injectable()
export class BackgroundRemovalService {
  private readonly logger = new Logger(BackgroundRemovalService.name);
  private sessionPromise: Promise<Ort.InferenceSession> | null = null;

  constructor(private readonly config: ConfigService) {
    sharp.cache(false);
  }

  enabled(): boolean {
    return this.config.get<string>('BACKGROUND_REMOVAL_ENABLED', 'true') !== 'false';
  }

  modelPath(): string {
    return resolve(
      this.config.get<string>(
        'BACKGROUND_REMOVAL_MODEL_PATH',
        'assets/models/u2net.onnx',
      ),
    );
  }

  async remove(inputPath: string): Promise<BackgroundRemovalResult> {
    if (!this.enabled()) {
      throw new BackgroundRemovalUnavailableError('Background removal is disabled.');
    }
    const started = Date.now();
    const source = sharp(inputPath).rotate();
    const metadata = await source.metadata();
    const sourceWidth = metadata.width ?? 0;
    const sourceHeight = metadata.height ?? 0;
    if (sourceWidth < 8 || sourceHeight < 8) {
      throw new BackgroundRemovalQualityError('Image is too small to segment.');
    }

    // Already-transparent PNGs are padded, never re-segmented: their authored
    // alpha is the best possible mask and re-running inference can damage it.
    if (metadata.hasAlpha) {
      const alphaStats = (await sharp(inputPath).rotate().stats()).channels.at(-1);
      if (alphaStats && alphaStats.min < 250) {
        const padded = await this.squareFromExistingAlpha(inputPath);
        return {
          ...padded,
          backgroundRemoved: false,
          model: MODEL_VERSION,
          durationMs: Date.now() - started,
          skippedReason: 'ALREADY_TRANSPARENT',
        };
      }
    }

    // Only opaque images need the segmentation model. Already-transparent
    // sources are padded above and must remain processable on hosts where the
    // model is not provisioned (for example CI).
    const modelPath = this.modelPath();
    if (!existsSync(modelPath)) {
      throw new BackgroundRemovalUnavailableError(
        `Background model not provisioned at ${modelPath}.`,
      );
    }
    const session = await this.getSession(modelPath);
    const { data } = await sharp(inputPath)
      .rotate()
      .resize(MODEL_INPUT, MODEL_INPUT, { fit: 'fill' })
      .removeAlpha()
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = MODEL_INPUT * MODEL_INPUT;
    const input = new Float32Array(3 * pixels);
    for (let i = 0; i < pixels; i += 1) {
      const r = data[i * 3]! / 255;
      const g = data[i * 3 + 1]! / 255;
      const b = data[i * 3 + 2]! / 255;
      input[i] = (r - IMAGENET_MEAN[0]!) / IMAGENET_STD[0]!;
      input[pixels + i] = (g - IMAGENET_MEAN[1]!) / IMAGENET_STD[1]!;
      input[2 * pixels + i] = (b - IMAGENET_MEAN[2]!) / IMAGENET_STD[2]!;
    }

    const ort = loadOrt();
    const feeds: Record<string, Ort.Tensor> = {
      [session.inputNames[0]!]: new ort.Tensor('float32', input, [
        1,
        3,
        MODEL_INPUT,
        MODEL_INPUT,
      ]),
    };
    const output = await session.run(feeds);
    const tensor = output[session.outputNames[0]!]!;
    const rawMask = tensor.data as Float32Array;
    if (rawMask.length !== pixels) {
      throw new BackgroundRemovalQualityError(
        'Unexpected segmentation mask shape.',
      );
    }
    let min = Infinity;
    let max = -Infinity;
    for (const value of rawMask) {
      if (!Number.isFinite(value)) {
        continue;
      }
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-5) {
      throw new BackgroundRemovalQualityError(
        'Segmentation produced an unusable uniform mask.',
      );
    }

    let strongForeground = 0;
    for (let i = 0; i < pixels; i += 1) {
      if ((rawMask[i]! - min) / (max - min) > 0.5) {
        strongForeground += 1;
      }
    }
    // Thin components (cables, stems) occupy a tiny mask area; a hard shadow
    // floor would erase them. Use a gentler ramp plus the conservative
    // colour-distance fallback below for genuinely sparse masks.
    const sparse = strongForeground / pixels < 0.03;
    const floor = sparse ? 0.02 : 0.14;
    const span = sparse ? 0.9 : 0.78;
    const alphaSmall = Buffer.alloc(pixels);
    for (let i = 0; i < pixels; i += 1) {
      const normalized = (rawMask[i]! - min) / (max - min);
      const clamped = Math.min(1, Math.max(0, (normalized - floor) / span));
      const smooth = clamped * clamped * (3 - 2 * clamped);
      alphaSmall[i] = Math.round(smooth * 255);
    }

    const alphaResized = await sharp(alphaSmall, {
      raw: { width: MODEL_INPUT, height: MODEL_INPUT, channels: 1 },
    })
      .resize(sourceWidth, sourceHeight, {
        fit: 'fill',
        kernel: 'lanczos3',
      })
      .blur(0.5)
      // Resize promotes a 1-channel raw input to RGB; extract the mask band
      // explicitly so the byte layout matches width×height×1 below.
      .extractChannel(0)
      .raw()
      .toBuffer();

    if (sparse) {
      const fallback = await this.sparseColorFallback(
        inputPath,
        sourceWidth,
        sourceHeight,
      );
      if (fallback) {
        for (let i = 0; i < alphaResized.length; i += 1) {
          alphaResized[i] = Math.max(alphaResized[i]!, fallback[i]!);
        }
      }
    }

    const gate = this.analyzeAlpha(alphaResized, sourceWidth, sourceHeight);
    if (gate.coverage < 0.002) {
      throw new BackgroundRemovalQualityError(
        'Background removal removed almost the entire product.',
      );
    }
    if (gate.coverage > 0.995) {
      throw new BackgroundRemovalQualityError(
        'Background removal could not separate the product from its background.',
      );
    }
    if (gate.bbox.width < 4 || gate.bbox.height < 4) {
      throw new BackgroundRemovalQualityError(
        'Background removal produced an empty product region.',
      );
    }

    const bbox = gate.bbox;
    const product = await sharp(inputPath)
      .rotate()
      .extract({
        left: bbox.left,
        top: bbox.top,
        width: bbox.width,
        height: bbox.height,
      })
      .removeAlpha()
      .raw()
      .toBuffer();
    const productAlpha = await sharp(alphaResized, {
      raw: { width: sourceWidth, height: sourceHeight, channels: 1 },
    })
      .extract({
        left: bbox.left,
        top: bbox.top,
        width: bbox.width,
        height: bbox.height,
      })
      .extractChannel(0)
      .raw()
      .toBuffer();
    const productRgba = await sharp(product, {
      raw: { width: bbox.width, height: bbox.height, channels: 3 },
    })
      .joinChannel(productAlpha, {
        raw: { width: bbox.width, height: bbox.height, channels: 1 },
      })
      .png()
      .toBuffer();

    const square = await this.squareCanvas(
      productRgba,
      Math.max(sourceWidth, sourceHeight),
    );
    return {
      ...square,
      backgroundRemoved: true,
      model: MODEL_VERSION,
      coverage: gate.coverage,
      alphaBBox: bbox,
      durationMs: Date.now() - started,
    };
  }

  /**
   * Conservative supplemental mask for sparse/thin subjects. Only used when
   * the model found <3% foreground. It estimates the border colour and keeps
   * pixels whose colour distance from that background is significant; the
   * result is a union with the model mask, never a replacement. This is not
   * the primary removal method and cannot remove white-on-white details on
   * its own.
   */
  private async sparseColorFallback(
    inputPath: string,
    width: number,
    height: number,
  ): Promise<Buffer | null> {
    const { data, info } = await sharp(inputPath)
      .rotate()
      .resize(width, height, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 3 || width * height * 3 !== data.length) {
      return null;
    }
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    const band = Math.max(2, Math.round(Math.min(width, height) * 0.04));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x >= band && x < width - band && y >= band && y < height - band) {
          continue;
        }
        const i = (y * width + x) * 3;
        r += data[i]!;
        g += data[i + 1]!;
        b += data[i + 2]!;
        count += 1;
      }
    }
    if (count === 0) {
      return null;
    }
    const bg = { r: r / count, g: g / count, b: b / count };
    const mask = Buffer.alloc(width * height);
    let foreground = 0;
    for (let i = 0; i < width * height; i += 1) {
      const dr = data[i * 3]! - bg.r;
      const dg = data[i * 3 + 1]! - bg.g;
      const db = data[i * 3 + 2]! - bg.b;
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      if (distance > 38) {
        mask[i] = 255;
        foreground += 1;
      }
    }
    const fraction = foreground / (width * height);
    if (fraction < 0.002 || fraction > 0.6) {
      return null;
    }
    return sharp(mask, { raw: { width, height, channels: 1 } })
      .blur(0.8)
      .extractChannel(0)
      .raw()
      .toBuffer();
  }

  private async getSession(modelPath: string): Promise<Ort.InferenceSession> {
    if (!this.sessionPromise) {
      let ort: OrtModule;
      try {
        ort = loadOrt();
      } catch (error) {
        throw new BackgroundRemovalUnavailableError(
          `onnxruntime-node is not installed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      this.sessionPromise = ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      }).catch((error) => {
        this.sessionPromise = null;
        this.logger.error(
          `Background model load failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw new BackgroundRemovalUnavailableError(
          'Background model could not be loaded.',
        );
      });
    }
    return this.sessionPromise;
  }

  /**
   * Square transparent canvas sized from the longest source edge, capped at
   * 1200px. The product is fitted inside an 84% safe area with balanced
   * padding; never stretched or cropped.
   */
  private async squareCanvas(
    productPng: Buffer,
    longestSourceEdge: number,
  ): Promise<{
    buffer: Buffer;
    width: number;
    height: number;
    canvasSize: number;
  }> {
    const canvasSize = Math.max(
      320,
      Math.min(1200, Math.round(longestSourceEdge)),
    );
    const inner = Math.max(1, Math.round(canvasSize * 0.84));
    const product = await sharp(productPng)
      .resize({
        width: inner,
        height: inner,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer({ resolveWithObject: true });
    const left = Math.max(0, Math.floor((canvasSize - product.info.width) / 2));
    const top = Math.max(0, Math.floor((canvasSize - product.info.height) / 2));
    const buffer = await sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: product.data, left, top }])
      .png()
      .toBuffer();
    return { buffer, width: canvasSize, height: canvasSize, canvasSize };
  }

  private async squareFromExistingAlpha(inputPath: string): Promise<{
    buffer: Buffer;
    width: number;
    height: number;
    coverage: number;
    alphaBBox: { left: number; top: number; width: number; height: number };
    canvasSize: number;
  }> {
    const trimmed = await sharp(inputPath)
      .rotate()
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true });
    const square = await this.squareCanvas(
      trimmed.data,
      Math.max(trimmed.info.width, trimmed.info.height),
    );
    return {
      ...square,
      width: square.width,
      height: square.height,
      coverage: 0.5,
      alphaBBox: {
        left: 0,
        top: 0,
        width: trimmed.info.width,
        height: trimmed.info.height,
      },
    };
  }

  private analyzeAlpha(
    alpha: Buffer,
    width: number,
    height: number,
  ): {
    coverage: number;
    bbox: { left: number; top: number; width: number; height: number };
  } {
    let foreground = 0;
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = alpha[y * width + x]!;
        if (value > 8) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
        if (value > 128) {
          foreground += 1;
        }
      }
    }
    return {
      coverage: foreground / (width * height),
      bbox:
        right < 0
          ? { left: 0, top: 0, width: 0, height: 0 }
          : {
              left,
              top,
              width: right - left + 1,
              height: bottom - top + 1,
            },
    };
  }
}
