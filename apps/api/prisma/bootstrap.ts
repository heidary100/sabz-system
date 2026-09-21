import { PrismaClient } from '@prisma/client';
// Single source lives under src (nest build rootDir); this CLI entry keeps
// working through re-exports.
import {
  DEFAULT_WAREHOUSE_CODE,
  DEFAULT_WAREHOUSE_NAME,
  ensureDefaultWarehouse,
} from '../src/common/database/default-warehouse';

export { DEFAULT_WAREHOUSE_CODE, DEFAULT_WAREHOUSE_NAME, ensureDefaultWarehouse };

const prisma = new PrismaClient();

export async function bootstrap(client: PrismaClient): Promise<void> {
  await ensureDefaultWarehouse(client);
}

async function main(): Promise<void> {
  await bootstrap(prisma);
  console.log('Bootstrap complete: default warehouse ensured.');
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Bootstrap failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
