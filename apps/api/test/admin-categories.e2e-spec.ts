import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BASE = '/api/v1/admin/categories';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

describe('Admin category API (SS-103) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const roleIds: Record<string, string> = {};
  const categoryIds: string[] = [];

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

    for (const role of ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN']) {
      roleIds[role] = await seedRole(role);
    }
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: categoryIds } },
    });
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

  async function createCategoryViaApi(
    token: string,
    body: Record<string, unknown>,
  ) {
    const res = await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
    categoryIds.push(res.body.id);
    return res.body;
  }

  describe('authentication and authorization', () => {
    it('rejects every endpoint without a token with 401', async () => {
      const id = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer()).get(BASE).expect(401);
      await request(app.getHttpServer()).get(`${BASE}/tree`).expect(401);
      await request(app.getHttpServer()).get(`${BASE}/${id}`).expect(401);
      await request(app.getHttpServer()).post(BASE).send({}).expect(401);
      await request(app.getHttpServer()).patch(`${BASE}/${id}`).send({}).expect(401);
      await request(app.getHttpServer())
        .patch(`${BASE}/${id}/reorder`)
        .send({})
        .expect(401);
      await request(app.getHttpServer()).delete(`${BASE}/${id}`).expect(401);
    });

    it('rejects CUSTOMER and PARTNER with 403', async () => {
      const customer = await createUser('CUSTOMER');
      const partner = await createUser('PARTNER');
      const id = '00000000-0000-0000-0000-000000000000';

      for (const token of [customer.accessToken, partner.accessToken]) {
        await request(app.getHttpServer())
          .get(BASE)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(app.getHttpServer())
          .post(BASE)
          .set('Authorization', `Bearer ${token}`)
          .send({ name: 'x' })
          .expect(403);
        await request(app.getHttpServer())
          .delete(`${BASE}/${id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
    });

    it('allows OPERATOR and ADMIN to list categories', async () => {
      const operator = await createUser('OPERATOR');
      const admin = await createUser('ADMIN');
      await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
    });
  });

  describe('CRUD flow', () => {
    it('creates, lists, reads detail, updates (including move) and soft-deletes', async () => {
      const operator = await createUser('OPERATOR');
      const root = await createCategoryViaApi(operator.accessToken, {
        name: `Laptops ${Date.now()}`,
        slug: `laptops-${Date.now()}`,
        sortOrder: 1,
      });
      expect(root.slug).toBeDefined();
      expect(root.parentId).toBeNull();
      expect(root.children).toEqual([]);

      const child = await createCategoryViaApi(operator.accessToken, {
        name: `Gaming ${Date.now()}`,
        slug: `gaming-${Date.now()}`,
        parentId: root.id,
      });
      expect(child.parentId).toBe(root.id);

      const list = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(Array.isArray(list.body.items)).toBe(true);
      const serializedList = JSON.stringify(list.body);
      expect(serializedList).not.toContain('deletedAt');
      expect(serializedList).not.toContain('createdBy');
      expect(serializedList).not.toContain('updatedBy');

      const detail = await request(app.getHttpServer())
        .get(`${BASE}/${root.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(detail.body.children.length).toBeGreaterThanOrEqual(1);
      const serializedDetail = JSON.stringify(detail.body);
      expect(serializedDetail).not.toContain('deletedAt');
      expect(serializedDetail).not.toContain('createdBy');
      expect(serializedDetail).not.toContain('updatedBy');

      const updated = await request(app.getHttpServer())
        .patch(`${BASE}/${child.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ name: 'Renamed', parentId: null, isVisible: false })
        .expect(200);
      expect(updated.body.name).toBe('Renamed');
      expect(updated.body.parentId).toBeNull();
      expect(updated.body.isVisible).toBe(false);

      await request(app.getHttpServer())
        .delete(`${BASE}/${child.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
    });

    it('returns 404 for invalid UUID, non-existent and soft-deleted categories', async () => {
      const operator = await createUser('OPERATOR');
      await request(app.getHttpServer())
        .get(`${BASE}/not-a-uuid`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);

      const category = await createCategoryViaApi(operator.accessToken, {
        name: `Temp ${Date.now()}`,
        slug: `temp-${Date.now()}`,
      });
      await request(app.getHttpServer())
        .delete(`${BASE}/${category.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`${BASE}/${category.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${BASE}/${category.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ name: 'x' })
        .expect(404);
    });

    it('returns 400 for invalid bodies', async () => {
      const operator = await createUser('OPERATOR');
      await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({})
        .expect(400);
      await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ name: 'x', slug: 'BAD SLUG!' })
        .expect(400);
      await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ name: 'x', sortOrder: -1 })
        .expect(400);
    });

    it('returns 409 for a duplicate slug', async () => {
      const operator = await createUser('OPERATOR');
      const slug = `dup-${Date.now()}`;
      await createCategoryViaApi(operator.accessToken, { name: 'A', slug });
      await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ name: 'B', slug })
        .expect(409);
    });

    it('returns 404 when the parent category does not exist', async () => {
      const operator = await createUser('OPERATOR');
      await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ name: 'Child', parentId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });

    it('rejects self-parenting with 409', async () => {
      const operator = await createUser('OPERATOR');
      const category = await createCategoryViaApi(operator.accessToken, {
        name: `Self ${Date.now()}`,
        slug: `self-${Date.now()}`,
      });
      await request(app.getHttpServer())
        .patch(`${BASE}/${category.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ parentId: category.id })
        .expect(409);
    });

    it('rejects a descendant cycle with 409', async () => {
      const operator = await createUser('OPERATOR');
      const a = await createCategoryViaApi(operator.accessToken, {
        name: `A ${Date.now()}`,
        slug: `a-${Date.now()}`,
      });
      const b = await createCategoryViaApi(operator.accessToken, {
        name: `B ${Date.now()}`,
        slug: `b-${Date.now()}`,
        parentId: a.id,
      });
      await request(app.getHttpServer())
        .patch(`${BASE}/${a.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ parentId: b.id })
        .expect(409);
    });

    it('rejects deletion when active children exist with 409', async () => {
      const operator = await createUser('OPERATOR');
      const parent = await createCategoryViaApi(operator.accessToken, {
        name: `Parent ${Date.now()}`,
        slug: `parent-${Date.now()}`,
      });
      await createCategoryViaApi(operator.accessToken, {
        name: `Child ${Date.now()}`,
        slug: `child-${Date.now()}`,
        parentId: parent.id,
      });
      await request(app.getHttpServer())
        .delete(`${BASE}/${parent.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(409);
    });

    it('rejects deletion when an active product references the category with 409', async () => {
      const operator = await createUser('OPERATOR');
      const category = await createCategoryViaApi(operator.accessToken, {
        name: `Used ${Date.now()}`,
        slug: `used-${Date.now()}`,
      });
      const brand = await prisma.brand.create({
        data: {
          name: `برند ${Date.now()}-${Math.random()}`,
          slug: `brand-${Date.now()}-${Math.random()}`,
        },
      });
      const product = await prisma.product.create({
        data: {
          name: `محصول ${Date.now()}-${Math.random()}`,
          slug: `prod-${Date.now()}-${Math.random()}`,
          brandId: brand.id,
          categoryId: category.id,
          condition: 'NEW',
          status: 'DRAFT',
        },
      });
      try {
        await request(app.getHttpServer())
          .delete(`${BASE}/${category.id}`)
          .set('Authorization', `Bearer ${operator.accessToken}`)
          .expect(409);
      } finally {
        await prisma.product.delete({ where: { id: product.id } });
        await prisma.brand.delete({ where: { id: brand.id } });
      }
    });

    it('never leaks internal fields in create response and strips logoKey-like extras', async () => {
      const operator = await createUser('OPERATOR');
      const res = await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ name: `Clean ${Date.now()}`, slug: `clean-${Date.now()}`, createdBy: 'hack', deletedAt: 'hack' })
        .expect(201);
      categoryIds.push(res.body.id);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('createdBy');
      expect(serialized).not.toContain('updatedBy');
      expect(serialized).not.toContain('deletedAt');
    });
  });

  describe('tree + reorder endpoints', () => {
    it('returns the full tree without internal fields', async () => {
      const operator = await createUser('OPERATOR');
      const root = await createCategoryViaApi(operator.accessToken, {
        name: `TreeRoot ${Date.now()}`,
        slug: `tree-root-${Date.now()}`,
      });
      await createCategoryViaApi(operator.accessToken, {
        name: `TreeChild ${Date.now()}`,
        slug: `tree-child-${Date.now()}`,
        parentId: root.id,
      });

      const res = await request(app.getHttpServer())
        .get(`${BASE}/tree`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const rootNode = res.body.find(
        (node: { id: string }) => node.id === root.id,
      );
      expect(rootNode).toBeDefined();
      expect(rootNode.children.length).toBeGreaterThanOrEqual(1);
      expect(typeof rootNode.children[0].productCount).toBe('number');
      expect(JSON.stringify(res.body)).not.toContain('deletedAt');
    });

    it('reorders siblings through the API and normalizes sort orders', async () => {
      const operator = await createUser('OPERATOR');
      const root = await createCategoryViaApi(operator.accessToken, {
        name: `OrderRoot ${Date.now()}`,
        slug: `order-root-${Date.now()}`,
      });
      const a = await createCategoryViaApi(operator.accessToken, {
        name: 'Order A',
        slug: `order-a-${Date.now()}`,
        parentId: root.id,
        sortOrder: 0,
      });
      const b = await createCategoryViaApi(operator.accessToken, {
        name: 'Order B',
        slug: `order-b-${Date.now()}`,
        parentId: root.id,
        sortOrder: 1,
      });

      const res = await request(app.getHttpServer())
        .patch(`${BASE}/${a.id}/reorder`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ position: 1 })
        .expect(200);
      expect(res.body.sortOrder).toBe(1);

      const tree = await request(app.getHttpServer())
        .get(`${BASE}/tree`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      const rootNode = tree.body.find(
        (node: { id: string }) => node.id === root.id,
      );
      expect(rootNode.children.map((child: { id: string }) => child.id)).toEqual([
        b.id,
        a.id,
      ]);
    });

    it('rejects a reorder that would form a cycle with 409', async () => {
      const operator = await createUser('OPERATOR');
      const a = await createCategoryViaApi(operator.accessToken, {
        name: `CycleA ${Date.now()}`,
        slug: `cycle-a-${Date.now()}`,
      });
      const b = await createCategoryViaApi(operator.accessToken, {
        name: `CycleB ${Date.now()}`,
        slug: `cycle-b-${Date.now()}`,
        parentId: a.id,
      });
      await request(app.getHttpServer())
        .patch(`${BASE}/${a.id}/reorder`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ parentId: b.id })
        .expect(409);
    });

    it('returns 400 for a negative position', async () => {
      const operator = await createUser('OPERATOR');
      const category = await createCategoryViaApi(operator.accessToken, {
        name: `Pos ${Date.now()}`,
        slug: `pos-${Date.now()}`,
      });
      await request(app.getHttpServer())
        .patch(`${BASE}/${category.id}/reorder`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ position: -1 })
        .expect(400);
    });
  });
});
