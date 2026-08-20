import {
  InventoryMovementType,
  Prisma,
  PrismaClient,
  ProductStatus,
} from '@prisma/client';

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

export async function backfillInventory(client: PrismaClient): Promise<void> {
  await client.$transaction(async (tx) => {
    await ensureDefaultWarehouse(tx);

    const defaultWarehouse = await tx.warehouse.findUniqueOrThrow({
      where: { code: DEFAULT_WAREHOUSE_CODE },
      select: { id: true },
    });

    const variants = await tx.productVariant.findMany({
      where: {
        deletedAt: null,
        product: {
          is: { deletedAt: null, status: { not: ProductStatus.ARCHIVED } },
        },
      },
      select: { id: true, stockQuantity: true },
    });

    for (const variant of variants) {
      const item = await tx.inventoryItem.upsert({
        where: {
          variantId_warehouseId: {
            variantId: variant.id,
            warehouseId: defaultWarehouse.id,
          },
        },
        update: {},
        create: {
          warehouseId: defaultWarehouse.id,
          variantId: variant.id,
          quantityOnHand: variant.stockQuantity,
          quantityReserved: 0,
        },
      });

      const movementCount = await tx.inventoryMovement.count({
        where: {
          inventoryItemId: item.id,
          type: InventoryMovementType.INITIAL_STOCK,
        },
      });

      if (movementCount === 0) {
        await tx.inventoryMovement.create({
          data: {
            inventoryItemId: item.id,
            variantId: variant.id,
            warehouseId: defaultWarehouse.id,
            type: InventoryMovementType.INITIAL_STOCK,
            quantity: variant.stockQuantity,
            reservedDelta: 0,
            onHandBefore: 0,
            onHandAfter: variant.stockQuantity,
            reservedBefore: 0,
            reservedAfter: 0,
          },
        });
      }
    }
  });
}

export async function bootstrap(client: PrismaClient): Promise<void> {
  await backfillInventory(client);
}

async function main(): Promise<void> {
  await bootstrap(prisma);
  console.log(
    'Bootstrap complete: default warehouse ensured and stock backfilled.',
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Bootstrap failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
