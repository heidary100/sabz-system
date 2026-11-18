import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { BackgroundRemovalService } from '../src/modules/products/media-processing/background-removal.service';

const inputDir = '/tmp/opencode/bg-fixtures';
const outputDir = '/tmp/opencode/bg-results';
mkdirSync(outputDir, { recursive: true });

(async () => {
  const service = new BackgroundRemovalService(new ConfigService());
  const files = readdirSync(inputDir).filter((f) => /\.(jpg|png)$/i.test(f));
  const rows: string[] = [];
  for (const file of files) {
    const result = await service.remove(join(inputDir, file));
    const stem = file.replace(/\.[^.]+$/, '');
    writeFileSync(join(outputDir, `${stem}.png`), result.buffer);
    const meta = await sharp(result.buffer).metadata();
    rows.push(
      `${file}\t${result.backgroundRemoved}\t${result.coverage.toFixed(4)}\t${meta.width}x${meta.height}\t${meta.hasAlpha}\t${result.durationMs}ms\t${result.skippedReason ?? ''}`,
    );
  }
  writeFileSync(join(outputDir, 'metrics.tsv'), ['file\tremoved\tcoverage\tsize\thasAlpha\tduration\tskipped', ...rows].join('\n'));
  console.log(rows.join('\n'));
})();
