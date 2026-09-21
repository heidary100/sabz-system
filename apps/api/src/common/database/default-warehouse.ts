import { Prisma, PrismaClient } from '@prisma/client';

export const DEFAULT_WAREHOUSE_CODE = 'DEFAULT';
export const DEFAULT_WAREHOUSE_NAME = 'انبار پیشفرض';

export async function ensureDefaultWarehouse(
  client: PrismaClient | Prisma.TransactionClient,
): Promise<void> {
  await client.warehouse.upsert({
    where: { code: DEFAULT_WAREHOUSE_CODE },
    update: {},
    create: { code: DEFAULT_WAREHOUSE_CODE, name: DEFAULT_WAREHOUSE_NAME },
  });
}
