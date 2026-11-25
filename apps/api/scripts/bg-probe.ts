import { writeFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { BackgroundRemovalService } from '../src/modules/products/media-processing/background-removal.service';

const [input, output] = process.argv.slice(2);
(async () => {
  const service = new BackgroundRemovalService(new ConfigService());
  const result = await service.remove(input!);
  writeFileSync(output!, result.buffer);
  console.log(JSON.stringify({
    backgroundRemoved: result.backgroundRemoved,
    coverage: result.coverage,
    width: result.width,
    height: result.height,
    skippedReason: result.skippedReason ?? null,
  }));
})();
