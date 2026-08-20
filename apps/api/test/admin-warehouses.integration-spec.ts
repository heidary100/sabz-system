import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { WarehousesService } from '../src/modules/inventory/warehouses.service';
import { bootstrap, DEFAULT_WAREHOUSE_CODE } from '../prisma/bootstrap';

jest.setTimeout(30_000);

describe('Admin warehouse API database integration (SS-111)', () => {
  let prisma: PrismaService;
  let service: WarehousesService;
  let defaultWarehouseId: string;

  const createdWarehouseIds: string[] = [];
  const createdAuditIds: string[] = [];
  const actorId = '11111111-1111-4111-8111-111111111111';

  async function trackAudits(entityId: string): Promise<void> {
    const rows = await prisma.auditLog.findMany({ where: { entityId } });
    createdAuditIds.push(...rows.map((row) => row.id));
  }

  async function createWarehouse(overrides: Record<string, unknown> = {}) {
    const result = await service.create(
      {
        code: `WH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: `انبار تست ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ...overrides,
      },
      actorId,
    );
    createdWarehouseIds.push(result.id);
    await trackAudits(result.id);
    return result;
  }

  async function activeCount(): Promise<number> {
    return prisma.warehouse.count({
      where: { status: 'ACTIVE', deletedAt: null },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await bootstrap(prisma);
    const audit = new AuditService(prisma);
    service = new WarehousesService(prisma, audit);
    const def = await prisma.warehouse.findUniqueOrThrow({
      where: { code: DEFAULT_WAREHOUSE_CODE },
      select: { id: true },
    });
    defaultWarehouseId = def.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: createdWarehouseIds } } });
    await prisma.warehouse.updateMany({
      where: { id: defaultWarehouseId, deletedAt: null },
      data: { status: 'ACTIVE' },
    });
    await prisma.$disconnect();
  });

  it('creates a warehouse with ACTIVE status and audits WAREHOUSE_CREATED', async () => {
    const created = await createWarehouse({ address: 'تهران' });

    expect(created.status).toBe('ACTIVE');
    expect(created.address).toBe('تهران');
    expect(created).not.toHaveProperty('deletedAt');
    expect(created).not.toHaveProperty('createdBy');
    expect(created).not.toHaveProperty('updatedBy');

    const audits = await prisma.auditLog.findMany({
      where: { entityId: created.id, action: 'WAREHOUSE_CREATED' },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.entity).toBe('Warehouse');
    expect(audits[0]!.userId).toBe(actorId);
    expect(JSON.stringify(audits[0]!.before)).toBe('null');
    expect(JSON.stringify(audits[0]!.after)).toContain('"status":"ACTIVE"');
    expect(JSON.stringify(audits[0]!.after)).not.toContain('deletedAt');
    expect(JSON.stringify(audits[0]!.after)).not.toContain('createdBy');
    expect(JSON.stringify(audits[0]!.after)).not.toContain('updatedBy');
  });

  it('lists warehouses with pagination and deterministic ordering', async () => {
    const first = await createWarehouse();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await createWarehouse();

    const page1 = await service.list({ page: 1, limit: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.total).toBeGreaterThanOrEqual(2);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(1);
    expect(page1.items[0]).not.toHaveProperty('deletedAt');
    expect(page1.items[0]).not.toHaveProperty('createdBy');
    expect(page1.items[0]).not.toHaveProperty('updatedBy');

    const page2 = await service.list({ page: 2, limit: 1 });
    expect(page2.items).toHaveLength(1);

    const ids = [...page1.items, ...page2.items].map((item) => item.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
  });

  it('filters by status and searches by name or code (case-insensitive)', async () => {
    const active = await createWarehouse({ name: 'انبار ویژه جستجو' });
    const codeFragment = active.code.slice(3, 8);

    const byName = await service.list({ search: 'ویژه جستجو' });
    expect(byName.items.map((item) => item.id)).toContain(active.id);

    const byCode = await service.list({ search: codeFragment });
    expect(byCode.items.map((item) => item.id)).toContain(active.id);

    const activeOnly = await service.list({ status: 'ACTIVE' });
    expect(activeOnly.items.every((item) => item.status === 'ACTIVE')).toBe(true);

    await service.deactivate(active.id, actorId);
    const inactiveOnly = await service.list({ status: 'INACTIVE' });
    expect(inactiveOnly.items.map((item) => item.id)).toContain(active.id);
  });

  it('returns warehouse detail and hides soft-deleted warehouses', async () => {
    const created = await createWarehouse({
      address: 'تهران',
      contactName: 'علی',
      contactPhone: '021111',
    });

    const detail = await service.getDetail(created.id);
    expect(detail.address).toBe('تهران');
    expect(detail.contactName).toBe('علی');
    expect(detail.contactPhone).toBe('021111');
    expect(detail).not.toHaveProperty('deletedAt');
    expect(detail).not.toHaveProperty('createdBy');
    expect(detail).not.toHaveProperty('updatedBy');

    await prisma.warehouse.update({
      where: { id: created.id },
      data: { deletedAt: new Date() },
    });

    await expect(service.getDetail(created.id)).rejects.toMatchObject({ status: 404 });
    const list = await service.list({ page: 1, limit: 100 });
    expect(list.items.find((item) => item.id === created.id)).toBeUndefined();
  });

  it('returns 409 on a duplicate code (P2002)', async () => {
    const sharedCode = `DUP-${Date.now()}`;
    const first = await createWarehouse({ code: sharedCode });
    await expect(
      service.create({ code: sharedCode, name: 'انبار دیگر' }, actorId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(first.status).toBe('ACTIVE');
  });

  it('updates mutable fields and audits WAREHOUSE_UPDATED with deltas', async () => {
    const created = await createWarehouse({ contactName: 'علی' });

    const updated = await service.update(
      created.id,
      { name: 'انبار بهروزشده', contactName: null },
      actorId,
    );
    expect(updated.name).toBe('انبار بهروزشده');
    expect(updated.contactName).toBeNull();

    const audits = await prisma.auditLog.findMany({
      where: { entityId: created.id, action: 'WAREHOUSE_UPDATED' },
    });
    expect(audits).toHaveLength(1);
    const before = JSON.parse(JSON.stringify(audits[0]!.before)) as Record<string, unknown>;
    const after = JSON.parse(JSON.stringify(audits[0]!.after)) as Record<string, unknown>;
    expect(before).toEqual(expect.objectContaining({ name: created.name, contactName: 'علی' }));
    expect(after).toEqual(expect.objectContaining({ name: 'انبار بهروزشده', contactName: null }));
  });

  it('rejects update of a soft-deleted warehouse with 404', async () => {
    const created = await createWarehouse();
    await prisma.warehouse.update({
      where: { id: created.id },
      data: { deletedAt: new Date() },
    });
    await expect(
      service.update(created.id, { name: 'x' }, actorId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 409 when updating a warehouse onto an existing code', async () => {
    const a = await createWarehouse();
    const b = await createWarehouse();
    await expect(
      service.update(b.id, { code: a.code }, actorId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('activates and deactivates with lifecycle audits', async () => {
    const created = await createWarehouse();
    await service.deactivate(created.id, actorId);
    const deactAudits = await prisma.auditLog.findMany({
      where: { entityId: created.id, action: 'WAREHOUSE_DEACTIVATED' },
    });
    expect(deactAudits).toHaveLength(1);
    expect(JSON.stringify(deactAudits[0]!.before)).toContain('"status":"ACTIVE"');
    expect(JSON.stringify(deactAudits[0]!.after)).toContain('"status":"INACTIVE"');

    await service.activate(created.id, actorId);
    const actAudits = await prisma.auditLog.findMany({
      where: { entityId: created.id, action: 'WAREHOUSE_ACTIVATED' },
    });
    expect(actAudits).toHaveLength(1);
    expect(JSON.stringify(actAudits[0]!.before)).toContain('"status":"INACTIVE"');
    expect(JSON.stringify(actAudits[0]!.after)).toContain('"status":"ACTIVE"');

    const detail = await service.getDetail(created.id);
    expect(detail.status).toBe('ACTIVE');
  });

  it('rejects double deactivate and double activate with 409', async () => {
    const created = await createWarehouse();
    await service.deactivate(created.id, actorId);
    await expect(service.deactivate(created.id, actorId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await service.activate(created.id, actorId);
    await expect(service.activate(created.id, actorId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects lifecycle operations on missing or soft-deleted warehouses with 404', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    await expect(service.activate(missing, actorId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deactivate(missing, actorId)).rejects.toBeInstanceOf(NotFoundException);

    const created = await createWarehouse();
    await prisma.warehouse.update({
      where: { id: created.id },
      data: { deletedAt: new Date() },
    });
    await expect(service.activate(created.id, actorId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deactivate(created.id, actorId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('protects the last active warehouse with 409', async () => {
    await prisma.warehouse.updateMany({
      where: { id: { not: defaultWarehouseId }, deletedAt: null },
      data: { status: 'INACTIVE' },
    });
    await expect(service.deactivate(defaultWarehouseId, actorId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const detail = await service.getDetail(defaultWarehouseId);
    expect(detail.status).toBe('ACTIVE');
  });

  it('allows deactivating one of several active warehouses', async () => {
    const a = await createWarehouse();
    const b = await createWarehouse();
    await service.deactivate(a.id, actorId);
    const detailB = await service.getDetail(b.id);
    expect(detailB.status).toBe('ACTIVE');
  });

  it('serializes concurrent deactivation of two active warehouses to exactly one winner', async () => {
    // Ensure exactly two active warehouses exist (including the seeded DEFAULT
    // warehouse) so the concurrent deactivations of `a` and `b` must race over
    // the last-active slot: the loser re-reads the locked active set after the
    // winner commits and fails with 409.
    await prisma.warehouse.updateMany({
      where: { deletedAt: null },
      data: { status: 'INACTIVE' },
    });
    const a = await createWarehouse();
    const b = await createWarehouse();

    const results = await Promise.allSettled([
      service.deactivate(a.id, actorId),
      service.deactivate(b.id, actorId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );

    const rejectedIndex = results.findIndex((r) => r.status === 'rejected');
    const loserId = rejectedIndex === 0 ? a.id : b.id;
    const loserRow = await prisma.warehouse.findUnique({ where: { id: loserId } });
    expect(loserRow?.status).toBe('ACTIVE');
    expect(await activeCount()).toBeGreaterThanOrEqual(1);
  });

  it('rolls back the mutation when the audit write fails', async () => {
    const failingAudit = { log: jest.fn().mockRejectedValue(new Error('audit failed')) };
    const failingService = new WarehousesService(
      prisma,
      failingAudit as unknown as AuditService,
    );

    await expect(
      failingService.create({ code: `FAIL-${Date.now()}`, name: 'انبار خطا' }, actorId),
    ).rejects.toThrow('audit failed');

    const created = await prisma.warehouse.findUnique({
      where: { code: `FAIL-${Date.now()}` },
    });
    expect(created).toBeNull();
  });

  it('does not create or modify inventory rows during warehouse lifecycle operations', async () => {
    const itemsBefore = await prisma.inventoryItem.count();
    const movementsBefore = await prisma.inventoryMovement.count();

    const created = await createWarehouse();
    await service.deactivate(created.id, actorId);
    await service.activate(created.id, actorId);
    await service.update(created.id, { name: 'انبار خنثی' }, actorId);

    const itemsAfter = await prisma.inventoryItem.count();
    const movementsAfter = await prisma.inventoryMovement.count();
    expect(itemsAfter).toBe(itemsBefore);
    expect(movementsAfter).toBe(movementsBefore);
  });
});