import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { bootstrap, DEFAULT_WAREHOUSE_CODE } from '../prisma/bootstrap';

jest.setTimeout(60_000);

const BASE = '/api/v1/admin/warehouses';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

describe('Admin warehouse API (SS-111) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let defaultWarehouseId: string;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const roleIds: Record<string, string> = {};
  const warehouseIds: string[] = [];

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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);
    await bootstrap(prisma);

    for (const role of ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN']) {
      roleIds[role] = await seedRole(role);
    }

    const def = await prisma.warehouse.findUniqueOrThrow({
      where: { code: DEFAULT_WAREHOUSE_CODE },
      select: { id: true },
    });
    defaultWarehouseId = def.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: warehouseIds } },
    });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ entityId: { in: userIds } }, { userId: { in: userIds } }],
      },
    });
    await prisma.userSession.deleteMany({
      where: { user: { mobile: { in: mobiles } } },
    });
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await prisma.warehouse.updateMany({
      where: { id: defaultWarehouseId, deletedAt: null },
      data: { status: 'ACTIVE' },
    });
    await app.close();
  });

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

  async function createWarehouseViaApi(
    token: string,
    body: Record<string, unknown>,
  ) {
    const res = await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
    warehouseIds.push(res.body.id);
    return res.body;
  }

  describe('authentication and authorization', () => {
    it('rejects every endpoint without a token with 401', async () => {
      const id = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer()).get(BASE).expect(401);
      await request(app.getHttpServer()).get(`${BASE}/${id}`).expect(401);
      await request(app.getHttpServer()).post(BASE).send({}).expect(401);
      await request(app.getHttpServer()).patch(`${BASE}/${id}`).send({}).expect(401);
      await request(app.getHttpServer()).post(`${BASE}/${id}/activate`).expect(401);
      await request(app.getHttpServer()).post(`${BASE}/${id}/deactivate`).expect(401);
    });

    it('rejects CUSTOMER, PARTNER and OPERATOR with 403', async () => {
      const customer = await createUser('CUSTOMER');
      const partner = await createUser('PARTNER');
      const operator = await createUser('OPERATOR');
      const id = '00000000-0000-0000-0000-000000000000';

      for (const token of [customer.accessToken, partner.accessToken, operator.accessToken]) {
        await request(app.getHttpServer())
          .get(BASE)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(app.getHttpServer())
          .get(`${BASE}/${id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(app.getHttpServer())
          .post(BASE)
          .set('Authorization', `Bearer ${token}`)
          .send({ code: 'X', name: 'x' })
          .expect(403);
        await request(app.getHttpServer())
          .patch(`${BASE}/${id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'x' })
          .expect(403);
        await request(app.getHttpServer())
          .post(`${BASE}/${id}/activate`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(app.getHttpServer())
          .post(`${BASE}/${id}/deactivate`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
    });

    it('allows ADMIN to list warehouses', async () => {
      const admin = await createUser('ADMIN');
      await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
    });
  });

  describe('CRUD flow', () => {
    it('creates, lists, reads detail and updates (including null clear)', async () => {
      const admin = await createUser('ADMIN');
      const created = await createWarehouseViaApi(admin.accessToken, {
        code: `E2E-${Date.now()}`,
        name: 'انبار سراسری',
        address: 'تهران',
        contactName: 'علی',
        contactPhone: '021111',
      });
      expect(created.status).toBe('ACTIVE');
      expect(created.address).toBe('تهران');
      expect(created.contactName).toBe('علی');
      expect(created).not.toHaveProperty('deletedAt');
      expect(created).not.toHaveProperty('createdBy');
      expect(created).not.toHaveProperty('updatedBy');

      const list = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(Array.isArray(list.body.items)).toBe(true);
      const serializedList = JSON.stringify(list.body);
      expect(serializedList).not.toContain('deletedAt');
      expect(serializedList).not.toContain('createdBy');
      expect(serializedList).not.toContain('updatedBy');

      const detail = await request(app.getHttpServer())
        .get(`${BASE}/${created.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(detail.body.name).toBe('انبار سراسری');
      expect(detail.body).not.toHaveProperty('deletedAt');

      const updated = await request(app.getHttpServer())
        .patch(`${BASE}/${created.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'انبار مرکزی', contactName: null, contactPhone: null })
        .expect(200);
      expect(updated.body.name).toBe('انبار مرکزی');
      expect(updated.body.contactName).toBeNull();
      expect(updated.body.contactPhone).toBeNull();
    });

    it('supports search, status filter and pagination', async () => {
      const admin = await createUser('ADMIN');
      const created = await createWarehouseViaApi(admin.accessToken, {
        code: `SEARCH-${Date.now()}`,
        name: 'انبار قابل جستجو',
      });
      await request(app.getHttpServer())
        .post(`${BASE}/${created.id}/deactivate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      const search = await request(app.getHttpServer())
        .get(`${BASE}?search=${encodeURIComponent('قابل جستجو')}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(search.body.items.map((item: { id: string }) => item.id)).toContain(created.id);

      const byCode = await request(app.getHttpServer())
        .get(`${BASE}?search=SEARCH-`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(byCode.body.items.map((item: { id: string }) => item.id)).toContain(created.id);

      const inactive = await request(app.getHttpServer())
        .get(`${BASE}?status=INACTIVE`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(inactive.body.items.map((item: { id: string }) => item.id)).toContain(created.id);

      const active = await request(app.getHttpServer())
        .get(`${BASE}?status=ACTIVE`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(active.body.items.every((item: { status: string }) => item.status === 'ACTIVE')).toBe(true);

      const paged = await request(app.getHttpServer())
        .get(`${BASE}?page=1&limit=5`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      expect(paged.body.items.length).toBeLessThanOrEqual(5);
      expect(paged.body.limit).toBe(5);
      expect(paged.body.page).toBe(1);
    });

    it('returns 404 for invalid UUID, non-existent and soft-deleted warehouses', async () => {
      const admin = await createUser('ADMIN');
      await request(app.getHttpServer())
        .get(`${BASE}/not-a-uuid`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(404);

      const created = await createWarehouseViaApi(admin.accessToken, {
        code: `GONE-${Date.now()}`,
        name: 'انبار حذفشده',
      });
      await prisma.warehouse.update({
        where: { id: created.id },
        data: { deletedAt: new Date() },
      });

      await request(app.getHttpServer())
        .get(`${BASE}/${created.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${BASE}/${created.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'x' })
        .expect(404);
      await request(app.getHttpServer())
        .post(`${BASE}/${created.id}/activate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`${BASE}/${created.id}/deactivate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(404);
    });

    it('returns 400 for invalid bodies', async () => {
      const admin = await createUser('ADMIN');
      await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(400);
      await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ code: 'x' })
        .expect(400);
      await request(app.getHttpServer())
        .get(`${BASE}?limit=101`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(`${BASE}?status=NOPE`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(400);
    });

    it('returns 409 for a duplicate code', async () => {
      const admin = await createUser('ADMIN');
      const sharedCode = `DUP-E2E-${Date.now()}`;
      await createWarehouseViaApi(admin.accessToken, { code: sharedCode, name: 'A' });
      await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ code: sharedCode, name: 'B' })
        .expect(409);
    });

    it('activates and deactivates warehouses', async () => {
      const admin = await createUser('ADMIN');
      const created = await createWarehouseViaApi(admin.accessToken, {
        code: `LIFE-${Date.now()}`,
        name: 'انبار چرخه حیات',
      });

      await request(app.getHttpServer())
        .post(`${BASE}/${created.id}/deactivate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`${BASE}/${created.id}/deactivate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(409);

      await request(app.getHttpServer())
        .post(`${BASE}/${created.id}/activate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`${BASE}/${created.id}/activate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(409);
    });

    it('protects the last active warehouse with 409', async () => {
      const admin = await createUser('ADMIN');
      await prisma.warehouse.updateMany({
        where: { id: { not: defaultWarehouseId }, deletedAt: null },
        data: { status: 'INACTIVE' },
      });
      const res = await request(app.getHttpServer())
        .post(`${BASE}/${defaultWarehouseId}/deactivate`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(409);
      expect(res.body).toBeDefined();
    });

    it('never leaks internal fields in responses', async () => {
      const admin = await createUser('ADMIN');
      const res = await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          code: `CLEAN-${Date.now()}`,
          name: 'انبار پاک',
          address: 'تهران',
          contactName: 'علی',
          contactPhone: '021111',
        })
        .expect(201);
      warehouseIds.push(res.body.id);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('deletedAt');
      expect(serialized).not.toContain('createdBy');
      expect(serialized).not.toContain('updatedBy');
      expect(serialized).not.toContain('inventoryItems');
    });
  });
});