import {
  InventoryMovementType,
  ProductCondition,
  ProductStatus,
  ReservationStatus,
  WarehouseStatus,
} from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';

jest.setTimeout(60_000);

class FailingAuditService extends AuditService {
  override async log(): Promise<void> {
    throw new Error('audit down');
  }
}

describe('Admin inventory reservation API database integration (SS-115)', () => {
  let prisma: PrismaService;
  let service: InventoryService;
  let failingAudit: AuditService;
  let failingService: InventoryService;

  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdWarehouseIds: string[] = [];
  const createdItemIds: string[] = [];
  const createdReservationIds: string[] = [];
  const actorId = '22222222-2222-4222-8222-222222222222';

  /** Distinguishes sequential createdAt values (repository convention). */
  async function tick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  async function createBrand(): Promise<string> {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${Date.now()}-${Math.random()}`,
        slug: `brand-invres-${Date.now()}-${Math.random()}`,
      },
    });
    createdBrandIds.push(brand.id);
    return brand.id;
  }

  async function createCategory(): Promise<string> {
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}-${Math.random()}`,
        slug: `cat-invres-${Date.now()}-${Math.random()}`,
      },
    });
    createdCategoryIds.push(category.id);
    return category.id;
  }

  async function createProduct(
    overrides: { status?: ProductStatus; deletedAt?: Date | null } = {},
  ): Promise<string> {
    const brandId = await createBrand();
    const categoryId = await createCategory();
    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}-${Math.random()}`,
        slug: `prod-invres-${Date.now()}-${Math.random()}`,
        brandId,
        categoryId,
        condition: ProductCondition.NEW,
        status: overrides.status ?? ProductStatus.DRAFT,
        deletedAt: overrides.deletedAt ?? null,
      },
    });
    createdProductIds.push(product.id);
    return product.id;
  }

  async function createVariant(
    productId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `SKU-INVRES-${Date.now()}-${Math.random()}`,
        price: '100.00',
        stockQuantity: 0,
        ...overrides,
      } as never,
    });
    createdVariantIds.push(variant.id);
    return variant.id;
  }

  async function createWarehouse(
    overrides: { status?: WarehouseStatus; deletedAt?: Date | null } = {},
  ): Promise<string> {
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `WH-INVRES-${Date.now()}-${Math.random()}`,
        name: `انبار تست ${Date.now()}-${Math.random()}`,
        status: overrides.status ?? WarehouseStatus.ACTIVE,
        deletedAt: overrides.deletedAt ?? null,
      },
    });
    createdWarehouseIds.push(warehouse.id);
    return warehouse.id;
  }

  async function createItem(
    variantId: string,
    warehouseId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const item = await prisma.inventoryItem.create({
      data: {
        variantId,
        warehouseId,
        quantityOnHand: 0,
        quantityReserved: 0,
        ...overrides,
      },
    });
    createdItemIds.push(item.id);
    return item.id;
  }

  async function findItem(variantId: string, warehouseId: string) {
    return prisma.inventoryItem.findUnique({
      where: { variantId_warehouseId: { variantId, warehouseId } },
    });
  }

  async function movementsOf(itemId: string) {
    return prisma.inventoryMovement.findMany({
      where: { inventoryItemId: itemId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async function auditsFor(reservationId: string, action: string) {
    return prisma.auditLog.findMany({
      where: { entity: 'Reservation', entityId: reservationId, action },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async function trackReservation(reservationId: string) {
    createdReservationIds.push(reservationId);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    service = new InventoryService(prisma, audit);
    failingAudit = new FailingAuditService(prisma);
    failingService = new InventoryService(prisma, failingAudit);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entity: 'Reservation', entityId: { in: createdReservationIds } },
          { entityId: { in: createdItemIds } },
          { entityId: { in: createdVariantIds } },
        ],
      },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { inventoryItemId: { in: createdItemIds } },
    });
    await prisma.reservation.deleteMany({
      where: {
        OR: [
          { id: { in: createdReservationIds } },
          { inventoryItemId: { in: createdItemIds } },
        ],
      },
    });
    await prisma.inventoryItem.deleteMany({
      where: { id: { in: createdItemIds } },
    });
    await prisma.warehouse.deleteMany({
      where: { id: { in: createdWarehouseIds } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { in: createdVariantIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({
      where: { id: { in: createdCategoryIds } },
    });
    await prisma.$disconnect();
  });

  describe('reserve', () => {
    it('creates an ACTIVE reservation, increments quantityReserved and leaves the aggregate untouched', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId, { stockQuantity: 10 });
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });

      const result = await service.reserve(
        { variantId, warehouseId, quantity: 3, expiresIn: 3600 },
        actorId,
      );
      await trackReservation(result.id);

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityOnHand).toBe(10);
      expect(item.quantityReserved).toBe(3);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(10);

      expect(result.status).toBe(ReservationStatus.ACTIVE);
      expect(result.quantity).toBe(3);
      expect(result.expiresAt).not.toBeNull();
      expect(result.variant.id).toBe(variantId);
      expect(result.warehouse.id).toBe(warehouseId);

      const movements = await movementsOf(itemId);
      expect(movements).toHaveLength(1);
      expect(movements[0]!.type).toBe(InventoryMovementType.RESERVATION);
      expect(movements[0]!.quantity).toBe(0);
      expect(movements[0]!.reservedDelta).toBe(3);
      expect(movements[0]!.onHandBefore).toBe(10);
      expect(movements[0]!.onHandAfter).toBe(10);
      expect(movements[0]!.reservedBefore).toBe(0);
      expect(movements[0]!.reservedAfter).toBe(3);

      const audits = await auditsFor(result.id, 'INVENTORY_RESERVED');
      expect(audits).toHaveLength(1);
      expect(audits[0]!.userId).toBe(actorId);
      expect(audits[0]!.after).toEqual({
        variantId,
        warehouseId,
        quantity: 3,
        onHandBefore: 10,
        onHandAfter: 10,
        reservedBefore: 0,
        reservedAfter: 3,
        expiresAt: result.expiresAt,
      });
    });

    it('stores expiresAt null when expiresIn is absent', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      await createItem(variantId, warehouseId, {
        quantityOnHand: 5,
      });

      const result = await service.reserve(
        { variantId, warehouseId, quantity: 1 },
        actorId,
      );
      await trackReservation(result.id);

      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: result.id },
      });
      expect(reservation.expiresAt).toBeNull();
      expect(result.expiresAt).toBeNull();
    });

    it('returns 409 when availability is insufficient and writes nothing', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 4,
        quantityReserved: 3,
      });

      await expect(
        service.reserve({ variantId, warehouseId, quantity: 2 }, actorId),
      ).rejects.toMatchObject({ status: 409 });

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityReserved).toBe(3);
      expect(await movementsOf(itemId)).toHaveLength(0);
    });

    it('returns 404 when no InventoryItem exists for the pair and never creates one', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();

      await expect(
        service.reserve({ variantId, warehouseId, quantity: 1 }, actorId),
      ).rejects.toMatchObject({ status: 404 });

      expect(await findItem(variantId, warehouseId)).toBeNull();
    });

    it('applies the lifecycle gates: 404 deleted variant, 409 archived product, 404 missing warehouse, 409 inactive warehouse', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const activeWh = await createWarehouse();
      const itemId = await createItem(variantId, activeWh, {
        quantityOnHand: 5,
      });

      const inactiveWh = await createWarehouse({ status: WarehouseStatus.INACTIVE });
      await expect(
        service.reserve({ variantId, warehouseId: inactiveWh, quantity: 1 }, actorId),
      ).rejects.toMatchObject({ status: 409 });

      const missing = '00000000-0000-4000-8000-000000000000';
      await expect(
        service.reserve({ variantId, warehouseId: missing, quantity: 1 }, actorId),
      ).rejects.toMatchObject({ status: 404 });

      const archivedProduct = await createProduct({ status: ProductStatus.ARCHIVED });
      const archivedVariant = await createVariant(archivedProduct);
      await expect(
        service.reserve({ variantId: archivedVariant, warehouseId: activeWh, quantity: 1 }, actorId),
      ).rejects.toMatchObject({ status: 409 });

      const deletedVariant = await createVariant(productId, { deletedAt: new Date() });
      await expect(
        service.reserve({ variantId: deletedVariant, warehouseId: activeWh, quantity: 1 }, actorId),
      ).rejects.toMatchObject({ status: 404 });

      expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).quantityReserved).toBe(0);
    });

    it('rolls back the reservation, reserved increment, movement and audit when the audit write fails', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });

      await expect(
        failingService.reserve({ variantId, warehouseId, quantity: 3 }, actorId),
      ).rejects.toThrow('audit down');

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityReserved).toBe(0);
      expect(await movementsOf(itemId)).toHaveLength(0);
      const reservations = await prisma.reservation.count({
        where: { inventoryItemId: itemId },
      });
      expect(reservations).toBe(0);
    });
  });

  describe('release', () => {
    it('restores availability with a RESERVATION_RELEASE movement and INVENTORY_RELEASED audit', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });
      const reserved = await service.reserve(
        { variantId, warehouseId, quantity: 3 },
        actorId,
      );
      await trackReservation(reserved.id);

      const result = await service.releaseReservation(reserved.id, actorId);

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityOnHand).toBe(10);
      expect(item.quantityReserved).toBe(0);
      expect(result.status).toBe(ReservationStatus.RELEASED);
      expect(result.releasedAt).not.toBeNull();

      const movements = await movementsOf(itemId);
      expect(movements).toHaveLength(2);
      expect(movements[1]!.type).toBe(InventoryMovementType.RESERVATION_RELEASE);
      expect(movements[1]!.quantity).toBe(0);
      expect(movements[1]!.reservedDelta).toBe(-3);
      expect(movements[1]!.reservedBefore).toBe(3);
      expect(movements[1]!.reservedAfter).toBe(0);

      const audits = await auditsFor(reserved.id, 'INVENTORY_RELEASED');
      expect(audits).toHaveLength(1);
      expect(audits[0]!.after).toEqual({
        variantId,
        warehouseId,
        quantity: 3,
        onHandBefore: 10,
        onHandAfter: 10,
        reservedBefore: 3,
        reservedAfter: 0,
      });
    });

    it('rejects a double release with 409 and writes nothing', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 5,
      });
      const reserved = await service.reserve(
        { variantId, warehouseId, quantity: 2 },
        actorId,
      );
      await trackReservation(reserved.id);

      await service.releaseReservation(reserved.id, actorId);
      await expect(service.releaseReservation(reserved.id, actorId)).rejects.toMatchObject({
        status: 409,
      });

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityReserved).toBe(0);
      expect(await movementsOf(itemId)).toHaveLength(2);
      expect(await auditsFor(reserved.id, 'INVENTORY_RELEASED')).toHaveLength(1);
    });

    it('returns 404 for a missing reservation', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      await expect(service.releaseReservation(missing, actorId)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('rolls back the transition and movement when the audit write fails', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 5,
      });
      const reserved = await service.reserve(
        { variantId, warehouseId, quantity: 2 },
        actorId,
      );
      await trackReservation(reserved.id);

      await expect(
        failingService.releaseReservation(reserved.id, actorId),
      ).rejects.toThrow('audit down');

      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: reserved.id },
      });
      expect(reservation.status).toBe(ReservationStatus.ACTIVE);
      expect(reservation.releasedAt).toBeNull();
      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityReserved).toBe(2);
      expect(await movementsOf(itemId)).toHaveLength(1);
    });
  });

  describe('consume', () => {
    it('reduces on-hand and reserved and keeps the aggregate synchronized', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId, { stockQuantity: 10 });
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });
      const reserved = await service.reserve(
        { variantId, warehouseId, quantity: 3 },
        actorId,
      );
      await trackReservation(reserved.id);

      const result = await service.consumeReservation(reserved.id, actorId);

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityOnHand).toBe(7);
      expect(item.quantityReserved).toBe(0);
      expect(result.status).toBe(ReservationStatus.CONSUMED);
      expect(result.consumedAt).not.toBeNull();

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(7);

      const movements = await movementsOf(itemId);
      expect(movements).toHaveLength(2);
      expect(movements[1]!.type).toBe(InventoryMovementType.SALE);
      expect(movements[1]!.quantity).toBe(-3);
      expect(movements[1]!.reservedDelta).toBe(-3);
      expect(movements[1]!.onHandBefore).toBe(10);
      expect(movements[1]!.onHandAfter).toBe(7);
      expect(movements[1]!.reservedBefore).toBe(3);
      expect(movements[1]!.reservedAfter).toBe(0);

      const audits = await auditsFor(reserved.id, 'INVENTORY_CONSUMED');
      expect(audits).toHaveLength(1);
      expect(audits[0]!.after).toEqual({
        variantId,
        warehouseId,
        quantity: 3,
        onHandBefore: 10,
        onHandAfter: 7,
        reservedBefore: 3,
        reservedAfter: 0,
      });
    });

    it('returns 409 when on-hand is insufficient and writes nothing', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 5,
      });
      const reserved = await service.reserve(
        { variantId, warehouseId, quantity: 3 },
        actorId,
      );
      await trackReservation(reserved.id);
      await prisma.inventoryItem.update({
        where: { id: itemId },
        data: { quantityOnHand: 2 },
      });

      await expect(service.consumeReservation(reserved.id, actorId)).rejects.toMatchObject({
        status: 409,
      });

      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: reserved.id },
      });
      expect(reservation.status).toBe(ReservationStatus.ACTIVE);
      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityOnHand).toBe(2);
      expect(item.quantityReserved).toBe(3);
      expect(await movementsOf(itemId)).toHaveLength(1);
    });

    it('returns 409 for a consumed reservation', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      await createItem(variantId, warehouseId, { quantityOnHand: 5 });
      const reserved = await service.reserve(
        { variantId, warehouseId, quantity: 1 },
        actorId,
      );
      await trackReservation(reserved.id);

      await service.consumeReservation(reserved.id, actorId);
      await expect(service.consumeReservation(reserved.id, actorId)).rejects.toMatchObject({
        status: 409,
      });
    });

    it('rolls back the transition, on-hand decrement, movement and aggregate when the audit write fails', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId, { stockQuantity: 10 });
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });
      const reserved = await service.reserve(
        { variantId, warehouseId, quantity: 3 },
        actorId,
      );
      await trackReservation(reserved.id);

      await expect(
        failingService.consumeReservation(reserved.id, actorId),
      ).rejects.toThrow('audit down');

      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: reserved.id },
      });
      expect(reservation.status).toBe(ReservationStatus.ACTIVE);
      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityOnHand).toBe(10);
      expect(item.quantityReserved).toBe(3);
      expect(await movementsOf(itemId)).toHaveLength(1);
      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(10);
    });
  });

  describe('lazy expiration', () => {
    it('expires overdue ACTIVE reservations on the next mutation and restores availability', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });
      const first = await service.reserve(
        { variantId, warehouseId, quantity: 3, expiresIn: 1 },
        actorId,
      );
      await trackReservation(first.id);
      const second = await service.reserve(
        { variantId, warehouseId, quantity: 2, expiresIn: 1 },
        actorId,
      );
      await trackReservation(second.id);

      await new Promise((resolve) => setTimeout(resolve, 1200));

      const fresh = await service.reserve(
        { variantId, warehouseId, quantity: 5 },
        actorId,
      );
      await trackReservation(fresh.id);

      const expiredFirst = await prisma.reservation.findUniqueOrThrow({
        where: { id: first.id },
      });
      const expiredSecond = await prisma.reservation.findUniqueOrThrow({
        where: { id: second.id },
      });
      expect(expiredFirst.status).toBe(ReservationStatus.EXPIRED);
      expect(expiredFirst.expiredAt).not.toBeNull();
      expect(expiredSecond.status).toBe(ReservationStatus.EXPIRED);
      expect(expiredSecond.expiredAt).not.toBeNull();
      expect(fresh.status).toBe(ReservationStatus.ACTIVE);

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityReserved).toBe(5);
      expect(item.quantityOnHand).toBe(10);

      const releases = (await movementsOf(itemId)).filter(
        (m) => m.type === InventoryMovementType.RESERVATION_RELEASE,
      );
      expect(releases).toHaveLength(2);
      const reasons = releases.map((m) => m.reason);
      expect(reasons).toEqual(['انقضای خودکار رزرو', 'انقضای خودکار رزرو']);

      expect(await auditsFor(first.id, 'INVENTORY_RELEASED')).toHaveLength(1);
      expect(await auditsFor(second.id, 'INVENTORY_RELEASED')).toHaveLength(1);
      const releaseAudit = (await auditsFor(first.id, 'INVENTORY_RELEASED'))[0]!;
      expect(releaseAudit.after).toMatchObject({
        quantity: 3,
        reason: 'انقضای خودکار رزرو',
      });
    });

    it('transitions a release-targeted expired reservation to EXPIRED instead of RELEASED', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });
      const reserved = await service.reserve(
        { variantId, warehouseId, quantity: 2, expiresIn: 1 },
        actorId,
      );
      await trackReservation(reserved.id);

      await new Promise((resolve) => setTimeout(resolve, 1200));

      await expect(service.releaseReservation(reserved.id, actorId)).rejects.toMatchObject({
        status: 409,
      });

      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: reserved.id },
      });
      expect(reservation.status).toBe(ReservationStatus.EXPIRED);
      expect(reservation.releasedAt).toBeNull();
      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityReserved).toBe(0);
      expect(await auditsFor(reserved.id, 'INVENTORY_RELEASED')).toHaveLength(1);
    });

    it('never double-releases under concurrent expiration triggers', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 30,
      });
      const reservationIds: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const reserved = await service.reserve(
          { variantId, warehouseId, quantity: 2, expiresIn: 1 },
          actorId,
        );
        reservationIds.push(reserved.id);
        createdReservationIds.push(reserved.id);
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));

      const results = await Promise.allSettled(
        [1, 2, 3].map(() =>
          service.reserve({ variantId, warehouseId, quantity: 1 }, actorId),
        ),
      );
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      for (const result of results) {
        if (result.status === 'fulfilled') {
          createdReservationIds.push(result.value.id);
        }
      }

      for (const id of reservationIds) {
        const reservation = await prisma.reservation.findUniqueOrThrow({
          where: { id },
        });
        expect(reservation.status).toBe(ReservationStatus.EXPIRED);
        expect(await auditsFor(id, 'INVENTORY_RELEASED')).toHaveLength(1);
      }

      const releases = (await movementsOf(itemId)).filter(
        (m) => m.type === InventoryMovementType.RESERVATION_RELEASE,
      );
      expect(releases).toHaveLength(5);
      expect(releases.reduce((sum, m) => sum + m.reservedDelta, 0)).toBe(-10);

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityReserved).toBe(3);
      expect(item.quantityReserved).toBeGreaterThanOrEqual(0);
    });
  });

  describe('concurrency', () => {
    it('concurrent reservations never oversell', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });

      const results = await Promise.allSettled(
        [1, 2, 3].map(() =>
          service.reserve({ variantId, warehouseId, quantity: 4 }, actorId),
        ),
      );
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(2);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({ reason: { status: 409 } });

      for (const result of fulfilled) {
        if (result.status === 'fulfilled') {
          createdReservationIds.push(result.value.id);
        }
      }

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityReserved).toBe(8);
      const reservations = await prisma.reservation.findMany({
        where: { inventoryItemId: itemId },
      });
      expect(reservations).toHaveLength(2);
      expect(reservations.every((r) => r.status === ReservationStatus.ACTIVE)).toBe(true);
      const movements = await movementsOf(itemId);
      expect(movements).toHaveLength(2);
      expect(movements.every((m) => m.type === InventoryMovementType.RESERVATION)).toBe(true);
      const fulfilledIds = fulfilled
        .filter((r) => r.status === 'fulfilled')
        .map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id);
      const reservationAudits = await prisma.auditLog.findMany({
        where: {
          entity: 'Reservation',
          entityId: { in: fulfilledIds },
          action: 'INVENTORY_RESERVED',
        },
      });
      expect(reservationAudits).toHaveLength(2);
    });

    it('concurrent release and consume on the same reservation have exactly one winner', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });
      const reserved = await service.reserve(
        { variantId, warehouseId, quantity: 3 },
        actorId,
      );
      await trackReservation(reserved.id);

      const results = await Promise.allSettled([
        service.releaseReservation(reserved.id, actorId),
        service.consumeReservation(reserved.id, actorId),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({ reason: { status: 409 } });

      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: reserved.id },
      });
      expect([ReservationStatus.RELEASED, ReservationStatus.CONSUMED]).toContain(
        reservation.status,
      );

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityReserved).toBe(0);
      if (reservation.status === ReservationStatus.CONSUMED) {
        expect(item.quantityOnHand).toBe(7);
      } else {
        expect(item.quantityOnHand).toBe(10);
      }

      const movements = await movementsOf(itemId);
      expect(movements).toHaveLength(2);
      expect(await auditsFor(reserved.id, 'INVENTORY_RELEASED')).toHaveLength(
        reservation.status === ReservationStatus.RELEASED ? 1 : 0,
      );
      expect(await auditsFor(reserved.id, 'INVENTORY_CONSUMED')).toHaveLength(
        reservation.status === ReservationStatus.CONSUMED ? 1 : 0,
      );
    });

    it('release still works after the warehouse is deactivated', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });
      const reserved = await service.reserve(
        { variantId, warehouseId, quantity: 3 },
        actorId,
      );
      await trackReservation(reserved.id);

      await prisma.warehouse.update({
        where: { id: warehouseId },
        data: { status: WarehouseStatus.INACTIVE },
      });

      const result = await service.releaseReservation(reserved.id, actorId);
      expect(result.status).toBe(ReservationStatus.RELEASED);

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityReserved).toBe(0);
    });

    it('consume still works after the product is archived', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });
      const reserved = await service.reserve(
        { variantId, warehouseId, quantity: 3 },
        actorId,
      );
      await trackReservation(reserved.id);

      await prisma.product.update({
        where: { id: productId },
        data: { status: ProductStatus.ARCHIVED },
      });

      const result = await service.consumeReservation(reserved.id, actorId);
      expect(result.status).toBe(ReservationStatus.CONSUMED);

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityOnHand).toBe(7);
    });
  });

  describe('listReservations', () => {
    it('filters by status, variant and warehouse and paginates with deterministic ordering', async () => {
      const productA = await createProduct();
      const productB = await createProduct();
      const variantA = await createVariant(productA);
      const variantB = await createVariant(productB);
      const warehouseA = await createWarehouse();
      const warehouseB = await createWarehouse();
      await createItem(variantA, warehouseA, { quantityOnHand: 10 });
      await createItem(variantB, warehouseB, { quantityOnHand: 10 });

      const resA1 = await service.reserve({ variantId: variantA, warehouseId: warehouseA, quantity: 1 }, actorId);
      await trackReservation(resA1.id);
      await tick();
      const resA2 = await service.reserve({ variantId: variantA, warehouseId: warehouseA, quantity: 1 }, actorId);
      await trackReservation(resA2.id);
      await tick();
      const resB = await service.reserve({ variantId: variantB, warehouseId: warehouseB, quantity: 1 }, actorId);
      await trackReservation(resB.id);

      await service.releaseReservation(resA1.id, actorId);

      const byVariant = await service.listReservations({ variantId: variantA });
      expect(byVariant.total).toBe(2);
      expect(byVariant.items.map((r) => r.id)).toEqual([resA2.id, resA1.id]);

      const byWarehouse = await service.listReservations({ warehouseId: warehouseB });
      expect(byWarehouse.total).toBe(1);
      expect(byWarehouse.items[0]!.id).toBe(resB.id);

      const byStatus = await service.listReservations({ status: ReservationStatus.RELEASED });
      expect(byStatus.items.some((r) => r.id === resA1.id)).toBe(true);
      expect(byStatus.items.every((r) => r.status === ReservationStatus.RELEASED)).toBe(true);

      const byBoth = await service.listReservations({
        variantId: variantA,
        warehouseId: warehouseA,
        status: ReservationStatus.ACTIVE,
      });
      expect(byBoth.total).toBe(1);
      expect(byBoth.items[0]!.id).toBe(resA2.id);

      const first = await service.listReservations({ variantId: variantA, page: 1, limit: 1 });
      expect(first.items).toHaveLength(1);
      expect(first.total).toBe(2);
      const second = await service.listReservations({ variantId: variantA, page: 2, limit: 1 });
      expect(second.items).toHaveLength(1);

      const empty = await service.listReservations({
        variantId: '00000000-0000-4000-8000-000000000000',
      });
      expect(empty.total).toBe(0);
      expect(empty.items).toEqual([]);

      const serialized = JSON.stringify(byVariant);
      expect(serialized).not.toContain('createdBy');
      expect(serialized).not.toContain('updatedBy');
      expect(serialized).not.toContain('deletedAt');
      expect(serialized).not.toContain('reference');
    });

    it('is read-only: listing does not expire or mutate anything', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });
      const reserved = await service.reserve(
        { variantId, warehouseId, quantity: 1, expiresIn: 1 },
        actorId,
      );
      await trackReservation(reserved.id);

      await new Promise((resolve) => setTimeout(resolve, 1200));

      const movementsBefore = (await movementsOf(itemId)).length;
      const result = await service.listReservations({});
      expect(result.total).toBeGreaterThan(0);

      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: reserved.id },
      });
      expect(reservation.status).toBe(ReservationStatus.ACTIVE);
      expect(await movementsOf(itemId)).toHaveLength(movementsBefore);
    });
  });
});