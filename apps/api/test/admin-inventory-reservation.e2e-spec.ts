import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request, { Response } from 'supertest';
import {
  InventoryMovementType,
  ProductCondition,
  ProductStatus,
  ReservationStatus,
  WarehouseStatus,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BASE = '/api/v1/admin/inventory';
const INVALID_UUID = '00000000-0000-0000-0000-000000000000';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

describe('Admin inventory reservation API (SS-115) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const roleIds: Record<string, string> = {};
  const brandIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];
  const variantIds: string[] = [];
  const warehouseIds: string[] = [];
  const itemIds: string[] = [];
  const reservationIds: string[] = [];

  let seededVariantId: string;
  let seededWarehouseId: string;

  async function seedRole(name: string): Promise<string> {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) {
      return existing.id;
    }
    try {
      const created = await prisma.role.create({ data: { name } });
      return created.id;
    } catch {
      const row = await prisma.role.findUnique({ where: { name } });
      if (row) {
        return row.id;
      }
      throw new Error(`Failed to seed role ${name}`);
    }
  }

  async function createUser(role: string) {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({ data: { mobile, status: 'ACTIVE' } });
    userIds.push(user.id);
    if (role) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: roleIds[role]!, assignedBy: user.id },
      });
    }
    await prisma.userProfile.create({
      data: { userId: user.id, firstName: 'علی', lastName: 'احمدی' },
    });
    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, accessToken: tokens.accessToken };
  }

  async function createProduct(
    overrides: { status?: ProductStatus; deletedAt?: Date | null } = {},
  ): Promise<string> {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${Date.now()}`,
        slug: `brand-e2e-res-${Date.now()}-${Math.random()}`,
      },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}`,
        slug: `cat-e2e-res-${Date.now()}-${Math.random()}`,
      },
    });
    categoryIds.push(category.id);
    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}`,
        slug: `prod-e2e-res-${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        status: overrides.status ?? ProductStatus.DRAFT,
        deletedAt: overrides.deletedAt ?? null,
      },
    });
    productIds.push(product.id);
    return product.id;
  }

  async function createVariant(
    productId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `E2E-RES-SKU-${Date.now()}-${Math.random()}`,
        price: '100.00',
        stockQuantity: 0,
        ...overrides,
      } as never,
    });
    variantIds.push(variant.id);
    return variant.id;
  }

  async function createWarehouse(
    overrides: { status?: WarehouseStatus; deletedAt?: Date | null } = {},
  ): Promise<string> {
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `E2E-RES-WH-${Date.now()}-${Math.random()}`,
        name: 'انبار تست',
        status: overrides.status ?? WarehouseStatus.ACTIVE,
        deletedAt: overrides.deletedAt ?? null,
      },
    });
    warehouseIds.push(warehouse.id);
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
    itemIds.push(item.id);
    return item.id;
  }

  async function reserve(
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const res = await request(app.getHttpServer())
      .post(`${BASE}/reserve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);
    if (res.status === 200 && typeof res.body?.id === 'string') {
      reservationIds.push(res.body.id);
    }
    return res;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);

    for (const role of ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN']) {
      roleIds[role] = await seedRole(role);
    }

    const productId = await createProduct();
    seededVariantId = await createVariant(productId);
    seededWarehouseId = await createWarehouse();
    await createItem(seededVariantId, seededWarehouseId, { quantityOnHand: 20 });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entity: 'Reservation', entityId: { in: reservationIds } },
          { entityId: { in: itemIds } },
          { entityId: { in: variantIds } },
        ],
      },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { inventoryItemId: { in: itemIds } },
    });
    await prisma.reservation.deleteMany({
      where: {
        OR: [
          { id: { in: reservationIds } },
          { inventoryItemId: { in: itemIds } },
        ],
      },
    });
    await prisma.inventoryItem.deleteMany({
      where: { id: { in: itemIds } },
    });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    await prisma.productVariant.deleteMany({
      where: { id: { in: variantIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ entityId: { in: userIds } }, { userId: { in: userIds } }],
      },
    });
    await prisma.userSession.deleteMany({
      where: { user: { mobile: { in: mobiles } } },
    });
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  describe('authentication and authorization', () => {
    it('rejects all reservation endpoints without a token with 401', async () => {
      await request(app.getHttpServer()).post(`${BASE}/reserve`).send({}).expect(401);
      await request(app.getHttpServer())
        .post(`${BASE}/reservations/${INVALID_UUID}/release`)
        .expect(401);
      await request(app.getHttpServer())
        .post(`${BASE}/reservations/${INVALID_UUID}/consume`)
        .expect(401);
      await request(app.getHttpServer()).get(`${BASE}/reservations`).expect(401);
    });

    it('rejects CUSTOMER and PARTNER with 403', async () => {
      const customer = await createUser('CUSTOMER');
      const partner = await createUser('PARTNER');

      for (const token of [customer.accessToken, partner.accessToken]) {
        await request(app.getHttpServer())
          .post(`${BASE}/reserve`)
          .set('Authorization', `Bearer ${token}`)
          .send({ variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1 })
          .expect(403);
        await request(app.getHttpServer())
          .post(`${BASE}/reservations/${INVALID_UUID}/release`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(app.getHttpServer())
          .post(`${BASE}/reservations/${INVALID_UUID}/consume`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(app.getHttpServer())
          .get(`${BASE}/reservations`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
    });

    it('allows OPERATOR and ADMIN to reserve', async () => {
      const operator = await createUser('OPERATOR');
      const admin = await createUser('ADMIN');

      for (const token of [operator.accessToken, admin.accessToken]) {
        const res = await request(app.getHttpServer())
          .post(`${BASE}/reserve`)
          .set('Authorization', `Bearer ${token}`)
          .send({ variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1 })
          .expect(200);
        expect(res.body.status).toBe('ACTIVE');
        reservationIds.push(res.body.id);
      }
    });
  });

  describe('reserve', () => {
    it('creates an ACTIVE reservation with a RESERVATION movement and INVENTORY_RESERVED audit', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const item = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });

      const res = await request(app.getHttpServer())
        .post(`${BASE}/reserve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId, quantity: 3, expiresIn: 3600 })
        .expect(200);

      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(reservation.status).toBe(ReservationStatus.ACTIVE);
      expect(reservation.quantity).toBe(3);
      expect(reservation.expiresAt).not.toBeNull();
      expect(res.body.quantity).toBe(3);
      expect(res.body.variant.id).toBe(variantId);
      expect(res.body.warehouse.id).toBe(warehouseId);

      const itemAfter = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: item },
      });
      expect(itemAfter.quantityReserved).toBe(3);
      expect(itemAfter.quantityOnHand).toBe(10);

      const movements = await prisma.inventoryMovement.findMany({
        where: { inventoryItemId: item },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]!.type).toBe(InventoryMovementType.RESERVATION);
      expect(movements[0]!.reservedDelta).toBe(3);

      const audits = await prisma.auditLog.findMany({
        where: { entity: 'Reservation', entityId: res.body.id, action: 'INVENTORY_RESERVED' },
      });
      expect(audits).toHaveLength(1);
    });

    it('returns 400 for invalid bodies', async () => {
      const operator = await createUser('OPERATOR');

      for (const body of [
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 0 },
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: -1 },
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1.5 },
        { variantId: seededVariantId, warehouseId: seededWarehouseId },
        { variantId: 'not-a-uuid', warehouseId: seededWarehouseId, quantity: 1 },
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1, expiresIn: 0 },
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1, expiresIn: -5 },
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1, expiresIn: 1.5 },
      ]) {
        await request(app.getHttpServer())
          .post(`${BASE}/reserve`)
          .set('Authorization', `Bearer ${operator.accessToken}`)
          .send(body)
          .expect(400);
      }
    });

    it('returns 409 for insufficient availability and 404 for a missing item', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      await createItem(variantId, warehouseId, {
        quantityOnHand: 2,
        quantityReserved: 1,
      });

      await request(app.getHttpServer())
        .post(`${BASE}/reserve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId, quantity: 2 })
        .expect(409);

      const productB = await createProduct();
      const variantB = await createVariant(productB);
      const warehouseB = await createWarehouse();
      await request(app.getHttpServer())
        .post(`${BASE}/reserve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId: variantB, warehouseId: warehouseB, quantity: 1 })
        .expect(404);
    });

    it('applies the lifecycle gates: 404 missing warehouse, 409 inactive warehouse, 409 archived product, 404 deleted variant', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const activeWh = await createWarehouse();
      await createItem(variantId, activeWh, { quantityOnHand: 5 });
      const inactiveWh = await createWarehouse({ status: WarehouseStatus.INACTIVE });

      await request(app.getHttpServer())
        .post(`${BASE}/reserve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId: INVALID_UUID, quantity: 1 })
        .expect(404);
      await request(app.getHttpServer())
        .post(`${BASE}/reserve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId: inactiveWh, quantity: 1 })
        .expect(409);

      const archivedProduct = await createProduct({ status: ProductStatus.ARCHIVED });
      const archivedVariant = await createVariant(archivedProduct);
      await request(app.getHttpServer())
        .post(`${BASE}/reserve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId: archivedVariant, warehouseId: activeWh, quantity: 1 })
        .expect(409);

      const deletedVariant = await createVariant(productId, { deletedAt: new Date() });
      await request(app.getHttpServer())
        .post(`${BASE}/reserve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId: deletedVariant, warehouseId: activeWh, quantity: 1 })
        .expect(404);
    });
  });

  describe('release and consume', () => {
    it('releases an ACTIVE reservation and restores availability', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const item = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });
      const reserved = await reserve(operator.accessToken, {
        variantId,
        warehouseId,
        quantity: 3,
      });

      const res = await request(app.getHttpServer())
        .post(`${BASE}/reservations/${reserved.body.id}/release`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(res.body.status).toBe('RELEASED');
      expect(res.body.releasedAt).not.toBeNull();
      const itemAfter = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: item },
      });
      expect(itemAfter.quantityReserved).toBe(0);
      expect(itemAfter.quantityOnHand).toBe(10);

      const movements = await prisma.inventoryMovement.findMany({
        where: { inventoryItemId: item },
      });
      expect(movements).toHaveLength(2);
      expect(movements[1]!.type).toBe(InventoryMovementType.RESERVATION_RELEASE);
    });

    it('returns 409 for a double release and 404 for a missing reservation and malformed id', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      await createItem(variantId, warehouseId, { quantityOnHand: 10 });
      const reserved = await reserve(operator.accessToken, {
        variantId,
        warehouseId,
        quantity: 1,
      });

      await request(app.getHttpServer())
        .post(`${BASE}/reservations/${reserved.body.id}/release`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`${BASE}/reservations/${reserved.body.id}/release`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(409);
      await request(app.getHttpServer())
        .post(`${BASE}/reservations/${INVALID_UUID}/release`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`${BASE}/reservations/not-a-uuid/release`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
    });

    it('consumes an ACTIVE reservation and keeps the aggregate synchronized', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId, { stockQuantity: 10 });
      const warehouseId = await createWarehouse();
      const item = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });
      const reserved = await reserve(operator.accessToken, {
        variantId,
        warehouseId,
        quantity: 3,
      });

      const res = await request(app.getHttpServer())
        .post(`${BASE}/reservations/${reserved.body.id}/consume`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(res.body.status).toBe('CONSUMED');
      const itemAfter = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: item },
      });
      expect(itemAfter.quantityReserved).toBe(0);
      expect(itemAfter.quantityOnHand).toBe(7);
      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(7);

      const movements = await prisma.inventoryMovement.findMany({
        where: { inventoryItemId: item },
      });
      expect(movements).toHaveLength(2);
      expect(movements[1]!.type).toBe(InventoryMovementType.SALE);
      expect(movements[1]!.quantity).toBe(-3);
    });

    it('returns 409 when consuming with insufficient on-hand', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const item = await createItem(variantId, warehouseId, { quantityOnHand: 5 });
      const reserved = await reserve(operator.accessToken, {
        variantId,
        warehouseId,
        quantity: 3,
      });
      await prisma.inventoryItem.update({
        where: { id: item },
        data: { quantityOnHand: 2 },
      });

      await request(app.getHttpServer())
        .post(`${BASE}/reservations/${reserved.body.id}/consume`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(409);

      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: reserved.body.id },
      });
      expect(reservation.status).toBe(ReservationStatus.ACTIVE);
    });

    it('returns 409 when consuming a released reservation', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      await createItem(variantId, warehouseId, { quantityOnHand: 10 });
      const reserved = await reserve(operator.accessToken, {
        variantId,
        warehouseId,
        quantity: 1,
      });

      await request(app.getHttpServer())
        .post(`${BASE}/reservations/${reserved.body.id}/release`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`${BASE}/reservations/${reserved.body.id}/consume`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(409);
    });
  });

  describe('list', () => {
    it('paginates, filters and orders deterministically', async () => {
      const operator = await createUser('OPERATOR');
      const productA = await createProduct();
      const variantA = await createVariant(productA);
      const warehouseA = await createWarehouse();
      await createItem(variantA, warehouseA, { quantityOnHand: 10 });
      const reserved = await reserve(operator.accessToken, {
        variantId: variantA,
        warehouseId: warehouseA,
        quantity: 1,
      });
      await reserve(operator.accessToken, {
        variantId: variantA,
        warehouseId: warehouseA,
        quantity: 2,
      });
      await request(app.getHttpServer())
        .post(`${BASE}/reservations/${reserved.body.id}/release`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      const list = await request(app.getHttpServer())
        .get(`${BASE}/reservations`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(list.body.total).toBeGreaterThanOrEqual(2);
      expect(list.body.page).toBe(1);
      expect(list.body.limit).toBe(20);
      expect(list.body.items.length).toBeGreaterThanOrEqual(2);

      const byVariant = await request(app.getHttpServer())
        .get(`${BASE}/reservations?variantId=${variantA}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(byVariant.body.total).toBe(2);
      expect(byVariant.body.items.every((r: { variant: { id: string } }) => r.variant.id === variantA)).toBe(true);

      const byStatus = await request(app.getHttpServer())
        .get(`${BASE}/reservations?status=RELEASED`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(byStatus.body.items.some((r: { id: string }) => r.id === reserved.body.id)).toBe(true);

      const paginated = await request(app.getHttpServer())
        .get(`${BASE}/reservations?variantId=${variantA}&page=1&limit=1`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(paginated.body.items).toHaveLength(1);
      expect(paginated.body.total).toBe(2);

      const empty = await request(app.getHttpServer())
        .get(`${BASE}/reservations?variantId=${INVALID_UUID}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(empty.body.total).toBe(0);
    });

    it('returns 400 for invalid query values', async () => {
      const operator = await createUser('OPERATOR');
      for (const query of [
        'page=0',
        'page=1.5',
        'limit=0',
        'limit=101',
        'status=NOPE',
        'variantId=not-a-uuid',
        'warehouseId=not-a-uuid',
      ]) {
        await request(app.getHttpServer())
          .get(`${BASE}/reservations?${query}`)
          .set('Authorization', `Bearer ${operator.accessToken}`)
          .expect(400);
      }
    });
  });

  describe('lazy expiration', () => {
    it('expires overdue reservations on the next mutation and restores availability', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const item = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });
      const reserved = await reserve(operator.accessToken, {
        variantId,
        warehouseId,
        quantity: 3,
        expiresIn: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 1200));

      const fresh = await request(app.getHttpServer())
        .post(`${BASE}/reserve`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId, quantity: 2 })
        .expect(200);
      reservationIds.push(fresh.body.id);

      const expired = await prisma.reservation.findUniqueOrThrow({
        where: { id: reserved.body.id },
      });
      expect(expired.status).toBe(ReservationStatus.EXPIRED);
      expect(expired.expiredAt).not.toBeNull();

      const itemAfter = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: item },
      });
      expect(itemAfter.quantityReserved).toBe(2);

      const releases = await prisma.inventoryMovement.findMany({
        where: { inventoryItemId: item, type: InventoryMovementType.RESERVATION_RELEASE },
      });
      expect(releases).toHaveLength(1);
      expect(releases[0]!.reason).toBe('انقضای خودکار رزرو');

      const audits = await prisma.auditLog.findMany({
        where: { entity: 'Reservation', entityId: reserved.body.id, action: 'INVENTORY_RELEASED' },
      });
      expect(audits).toHaveLength(1);
    });
  });

  describe('data minimization and route surface', () => {
    it('never exposes internal or secret fields', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      await createItem(variantId, warehouseId, { quantityOnHand: 10 });
      const reserved = await reserve(operator.accessToken, {
        variantId,
        warehouseId,
        quantity: 1,
      });

      const list = await request(app.getHttpServer())
        .get(`${BASE}/reservations?variantId=${variantId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      const res = await request(app.getHttpServer())
        .post(`${BASE}/reservations/${reserved.body.id}/release`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      for (const body of [res.body, list.body]) {
        const serialized = JSON.stringify(body);
        expect(serialized).not.toContain('reference');
        expect(serialized).not.toContain('createdBy');
        expect(serialized).not.toContain('updatedBy');
        expect(serialized).not.toContain('deletedAt');
        expect(serialized).not.toContain('passwordHash');
        expect(serialized).not.toContain('refreshToken');
        expect(serialized).not.toContain('sessionId');
        expect(serialized).not.toContain('storageKey');
      }
    });

    it('exposes no unsupported methods on the reservations resource', async () => {
      const operator = await createUser('OPERATOR');
      const token = operator.accessToken;
      await request(app.getHttpServer())
        .put(`${BASE}/reservations/${INVALID_UUID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${BASE}/reservations/${INVALID_UUID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .delete(`${BASE}/reservations/${INVALID_UUID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`${BASE}/reservations`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .post(`${BASE}/reserve/release`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);
    });
  });
});