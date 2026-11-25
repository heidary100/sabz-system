import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import {
  BackgroundRemovalService,
  BackgroundRemovalUnavailableError,
} from './background-removal.service';

const MODEL = 'assets/models/u2net.onnx';
const describeIfModel = existsSync(MODEL) ? describe : describe.skip;

describe('BackgroundRemovalService (SS-900)', () => {
  let dir: string;
  let service: BackgroundRemovalService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sabz-bg-'));
    service = new BackgroundRemovalService(new ConfigService());
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('fails closed when the pinned model is absent', async () => {
    const input = join(dir, 'opaque.jpg');
    await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toFile(input);
    const missing = new BackgroundRemovalService(
      new ConfigService({
        BACKGROUND_REMOVAL_MODEL_PATH: '/definitely/missing/u2net.onnx',
      }),
    );
    await expect(missing.remove(input)).rejects.toBeInstanceOf(
      BackgroundRemovalUnavailableError,
    );
  });

  it('fails closed when disabled', async () => {
    const disabled = new BackgroundRemovalService(
      new ConfigService({ BACKGROUND_REMOVAL_ENABLED: 'false' }),
    );
    await expect(disabled.remove(join(dir, 'none.png'))).rejects.toBeInstanceOf(
      BackgroundRemovalUnavailableError,
    );
  });

  it('pads an already-transparent image without re-segmenting it', async () => {
    const input = join(dir, 'transparent.png');
    await sharp({
      create: {
        width: 400,
        height: 240,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 120,
              height: 120,
              channels: 4,
              background: { r: 40, g: 90, b: 50, alpha: 1 },
            },
          })
            .png()
            .toBuffer(),
          left: 140,
          top: 60,
        },
      ])
      .png()
      .toFile(input);

    const result = await service.remove(input);
    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBe(meta.height);
    expect(meta.hasAlpha).toBe(true);
    expect(result.backgroundRemoved).toBe(false);
    expect(result.skippedReason).toBe('ALREADY_TRANSPARENT');
  });

  describeIfModel('with the provisioned U2-Net model', () => {
    it('keeps a dark product opaque, turns the background transparent, and returns a square PNG', async () => {
      const input = join(dir, 'dark.jpg');
      await sharp({
        create: {
          width: 700,
          height: 500,
          channels: 3,
          background: { r: 245, g: 245, b: 245 },
        },
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: 260,
                height: 300,
                channels: 3,
                background: { r: 30, g: 34, b: 38 },
              },
            })
              .png()
              .toBuffer(),
            left: 220,
            top: 100,
          },
        ])
        .jpeg()
        .toFile(input);
      const output = join(dir, 'out.png');
      // onnxruntime-node's native tensor bridge is incompatible with Jest's
      // vm realm, so the real inference runs in a normal Node child process.
      const stdout = execFileSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/bg-probe.ts', input, output],
        { encoding: 'utf8', timeout: 60_000 },
      );
      const result = JSON.parse(stdout.trim().split('\n').at(-1)!) as {
        backgroundRemoved: boolean;
        coverage: number;
        width: number;
        height: number;
      };
      const meta = await sharp(await readFile(output)).metadata();
      expect(meta.format).toBe('png');
      expect(meta.width).toBe(meta.height);
      expect(meta.hasAlpha).toBe(true);
      expect(result.backgroundRemoved).toBe(true);
      expect(result.coverage).toBeGreaterThan(0.01);
      expect(result.coverage).toBeLessThan(0.9);

      const { data, info } = await sharp(await readFile(output))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const corner = data[3]!;
      const center = data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3]!;
      expect(corner).toBeLessThan(20);
      expect(center).toBeGreaterThan(200);
    }, 60_000);

    it('preserves the source alpha for a transparent upload', async () => {
      const input = join(dir, 'alpha.png');
      await sharp({
        create: {
          width: 300,
          height: 300,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: 100,
                height: 100,
                channels: 4,
                background: { r: 220, g: 20, b: 20, alpha: 1 },
              },
            })
              .png()
              .toBuffer(),
            left: 100,
            top: 100,
          },
        ])
        .png()
        .toFile(input);
      const result = await service.remove(input);
      expect(result.backgroundRemoved).toBe(false);
      expect(result.skippedReason).toBe('ALREADY_TRANSPARENT');
    });
  });
});
