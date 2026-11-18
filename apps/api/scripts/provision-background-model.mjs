#!/usr/bin/env node
/**
 * Provisions the pinned U2-Net ONNX model used by local background removal.
 *
 * The weights are intentionally NOT committed (168 MB). Run:
 *   pnpm --filter @sabz/api model:provision
 * or point BACKGROUND_REMOVAL_MODEL_PATH at an operator-provisioned file.
 *
 * Source: https://github.com/danielgatis/rembg/releases/tag/v0.0.0
 * Upstream model: U-2-Net, Apache-2.0 (https://github.com/xuebinqin/U-2-Net)
 */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MODEL_URL =
  'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx';
const EXPECTED_SHA256 =
  '8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491';
const target = resolve(
  process.env.BACKGROUND_REMOVAL_MODEL_PATH ?? 'assets/models/u2net.onnx',
);
const partial = `${target}.part`;

async function main() {
  if (existsSync(target) && !process.argv.includes('--force')) {
    console.log(`Model already present at ${target}`);
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  console.log(`Downloading ${MODEL_URL}`);
  const response = await fetch(MODEL_URL, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  const hash = createHash('sha256');
  const { createReadStream } = await import('node:fs');
  await pipeline(createReadStream(partial), hash);
  const digest = hash.digest('hex');
  if (digest !== EXPECTED_SHA256) {
    rmSync(partial, { force: true });
    throw new Error(
      `Model checksum mismatch: expected ${EXPECTED_SHA256}, received ${digest}`,
    );
  }
  renameSync(partial, target);
  console.log(`Model ready at ${target} (sha256 ${digest})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
