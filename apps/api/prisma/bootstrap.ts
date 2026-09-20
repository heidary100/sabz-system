import { Prisma, PrismaClient } from '@prisma/client';

export const DEFAULT_WAREHOUSE_CODE = 'DEFAULT';
export const DEFAULT_WAREHOUSE_NAME = 'انبار پیشفرض';

const prisma = new PrismaClient();

export async function ensureDefaultWarehouse(
  client: PrismaClient | Prisma.TransactionClient,
): Promise<void> {
  await client.warehouse.upsert({
    where: { code: DEFAULT_WAREHOUSE_CODE },
    update: {},
    create: { code: DEFAULT_WAREHOUSE_CODE, name: DEFAULT_WAREHOUSE_NAME },
  });
}

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
