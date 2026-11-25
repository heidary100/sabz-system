import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { BackgroundRemovalService } from '../src/modules/products/media-processing/background-removal.service';
(async () => {
  const service = new BackgroundRemovalService(new ConfigService());
  const out = '/tmp/opencode/bg-seed-results'; mkdirSync(out,{recursive:true});
  for (const n of ['01','02','03','04','05','06']) {
    const file=`prisma/seed-catalog/images/seed-${n}.jpg`;
    const r=await service.remove(file);
    writeFileSync(join(out,`seed-${n}.png`),r.buffer);
    console.log(n,r.backgroundRemoved,r.coverage.toFixed(4),r.width,r.height,r.durationMs);
  }
})();
