import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BASE = '/api/v1/admin/brands';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

describe('Admin brand API (SS-103) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const roleIds: Record<string, string> = {};
  const brandIds: string[] = [];

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
      where: { entityId: { in: brandIds } },
    });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
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

  async function createBrandViaApi(
    token: string,
    body: Record<string, unknown>,
  ) {
    const res = await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
    brandIds.push(res.body.id);
    return res.body;
  }

  describe('authentication and authorization', () => {
    it('rejects every endpoint without a token with 401', async () => {
      const id = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer()).get(BASE).expect(401);
      await request(app.getHttpServer()).get(`${BASE}/${id}`).expect(401);
      await request(app.getHttpServer()).post(BASE).send({}).expect(401);
      await request(app.getHttpServer()).patch(`${BASE}/${id}`).send({}).expect(401);
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

    it('allows OPERATOR and ADMIN to list brands', async () => {
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
    it('creates, lists, reads detail, updates (including isFeatured) and soft-deletes', async () => {
      const operator = await createUser('OPERATOR');
      const created = await createBrandViaApi(operator.accessToken, {
        name: `Dell ${Date.now()}`,
        slug: `dell-${Date.now()}`,
        description: 'تولیدکننده سختافزار',
        isFeatured: true,
      });
      expect(created.slug).toBeDefined();
      expect(created.description).toBe('تولیدکننده سختافزار');
      expect(created.isFeatured).toBe(true);
      expect(created).not.toHaveProperty('logoKey');

      const list = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(Array.isArray(list.body.items)).toBe(true);
      const serializedList = JSON.stringify(list.body);
      expect(serializedList).not.toContain('logoKey');
      expect(serializedList).not.toContain('deletedAt');
      expect(serializedList).not.toContain('createdBy');
      expect(serializedList).not.toContain('updatedBy');

      const detail = await request(app.getHttpServer())
        .get(`${BASE}/${created.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(detail.body.isFeatured).toBe(true);
      expect(detail.body).not.toHaveProperty('logoKey');

      const updated = await request(app.getHttpServer())
        .patch(`${BASE}/${created.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ name: 'Dell Technologies', isFeatured: false, description: null })
        .expect(200);
      expect(updated.body.name).toBe('Dell Technologies');
      expect(updated.body.isFeatured).toBe(false);
      expect(updated.body.description).toBeNull();
      expect(updated.body).not.toHaveProperty('logoKey');

      await request(app.getHttpServer())
        .delete(`${BASE}/${created.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
    });

    it('returns 404 for invalid UUID, non-existent and soft-deleted brands', async () => {
      const operator = await createUser('OPERATOR');
      await request(app.getHttpServer())
        .get(`${BASE}/not-a-uuid`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);

      const brand = await createBrandViaApi(operator.accessToken, {
        name: `Temp ${Date.now()}`,
        slug: `temp-${Date.now()}`,
      });
      await request(app.getHttpServer())
        .delete(`${BASE}/${brand.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`${BASE}/${brand.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${BASE}/${brand.id}`)
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
        .send({ name: 'x', isFeatured: 'yes' })
        .expect(400);
    });

    it('returns 409 for a duplicate slug', async () => {
      const operator = await createUser('OPERATOR');
      const slug = `dup-brand-${Date.now()}`;
      await createBrandViaApi(operator.accessToken, { name: 'A', slug });
      await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ name: 'B', slug })
        .expect(409);
    });

    it('rejects deletion when an active product references the brand with 409', async () => {
      const operator = await createUser('OPERATOR');
      const brand = await createBrandViaApi(operator.accessToken, {
        name: `UsedBrand ${Date.now()}`,
        slug: `usedbrand-${Date.now()}`,
      });
      const category = await prisma.category.create({
        data: {
          name: `دسته ${Date.now()}-${Math.random()}`,
          slug: `cat-${Date.now()}-${Math.random()}`,
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
          .delete(`${BASE}/${brand.id}`)
          .set('Authorization', `Bearer ${operator.accessToken}`)
          .expect(409);
      } finally {
        await prisma.product.delete({ where: { id: product.id } });
        await prisma.category.delete({ where: { id: category.id } });
      }
    });

    it('never leaks internal fields and strips logoKey via whitelist', async () => {
      const operator = await createUser('OPERATOR');
      const res = await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ name: `Clean ${Date.now()}`, slug: `clean-${Date.now()}`, logoKey: 'hack' })
        .expect(201);
      brandIds.push(res.body.id);
      expect(res.body).not.toHaveProperty('logoKey');
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('createdBy');
      expect(serialized).not.toContain('updatedBy');
      expect(serialized).not.toContain('deletedAt');
    });
  });
});
