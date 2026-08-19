import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition, ProductStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BASE = '/api/v1/admin/products';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

describe('Admin product API (SS-102) (e2e)', () => {
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
      where: { entityId: { in: productIds } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { in: variantIds } },
    });
    const orphanProducts = await prisma.product.findMany({
      where: {
        OR: [
          { brandId: { in: brandIds } },
          { categoryId: { in: categoryIds } },
        ],
      },
      select: { id: true },
    });
    const orphanIds = orphanProducts.map((row) => row.id);
    await prisma.productVariant.deleteMany({
      where: { productId: { in: orphanIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: orphanIds } } });
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

  async function createUser(role: string) {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: { mobile, status: 'ACTIVE' },
    });
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
    return {
      userId: user.id,
      accessToken: tokens.accessToken,
    };
  }

  async function createBrandAndCategory() {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${Date.now()}-${Math.random()}`,
        slug: `brand-${Date.now()}-${Math.random()}`,
      },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}-${Math.random()}`,
        slug: `cat-${Date.now()}-${Math.random()}`,
      },
    });
    categoryIds.push(category.id);
    return { brandId: brand.id, categoryId: category.id };
  }

  async function createProductViaApi(
    token: string,
    overrides: Record<string, unknown> = {},
  ) {
    const { brandId, categoryId } = await createBrandAndCategory();
    const res = await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `محصول ${Date.now()}-${Math.random()}`,
        brandId,
        categoryId,
        condition: ProductCondition.NEW,
        ...overrides,
      })
      .expect(201);
    productIds.push(res.body.id);
    return res.body;
  }

  async function addVariantDirect(productId: string): Promise<void> {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `SKU-${Date.now()}-${Math.random()}`,
        price: '100.00',
        stockQuantity: 1,
      },
    });
    variantIds.push(variant.id);
  }

  describe('authentication and authorization', () => {
    it('rejects every endpoint without a token with 401', async () => {
      const id = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer()).get(BASE).expect(401);
      await request(app.getHttpServer()).get(`${BASE}/${id}`).expect(401);
      await request(app.getHttpServer()).post(BASE).send({}).expect(401);
      await request(app.getHttpServer()).patch(`${BASE}/${id}`).send({}).expect(401);
      await request(app.getHttpServer()).delete(`${BASE}/${id}`).expect(401);
      await request(app.getHttpServer()).post(`${BASE}/${id}/publish`).expect(401);
      await request(app.getHttpServer()).post(`${BASE}/${id}/archive`).expect(401);
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
          .send({})
          .expect(403);
        await request(app.getHttpServer())
          .post(`${BASE}/${id}/publish`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
    });

    it('allows OPERATOR and ADMIN to list products', async () => {
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
    it('creates, lists, filters, reads detail, updates, publishes, archives and deletes', async () => {
      const operator = await createUser('OPERATOR');

      const created = await createProductViaApi(operator.accessToken);
      expect(created.status).toBe(ProductStatus.DRAFT);
      expect(created.slug).toBeDefined();

      const list = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(Array.isArray(list.body.items)).toBe(true);
      expect(list.body.total).toBeGreaterThanOrEqual(1);
      const serializedList = JSON.stringify(list.body);
      expect(serializedList).not.toContain('storageKey');
      expect(serializedList).not.toContain('deletedAt');

      const filtered = await request(app.getHttpServer())
        .get(`${BASE}?status=DRAFT&search=${encodeURIComponent('محصول')}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(filtered.body.items.length).toBeGreaterThanOrEqual(1);

      const detail = await request(app.getHttpServer())
        .get(`${BASE}/${created.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(detail.body.variants).toEqual([]);
      expect(detail.body.media).toEqual([]);
      const serializedDetail = JSON.stringify(detail.body);
      expect(serializedDetail).not.toContain('storageKey');
      expect(serializedDetail).not.toContain('logoKey');
      expect(serializedDetail).not.toContain('createdBy');
      expect(serializedDetail).not.toContain('updatedBy');
      expect(serializedDetail).not.toContain('deletedAt');

      const updated = await request(app.getHttpServer())
        .patch(`${BASE}/${created.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ name: 'نام جدید', warranty: 'یک سال' })
        .expect(200);
      expect(updated.body.name).toBe('نام جدید');
      expect(updated.body.status).toBe(ProductStatus.DRAFT);

      // Publish fails without a variant.
      await request(app.getHttpServer())
        .post(`${BASE}/${created.id}/publish`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(409);

      await addVariantDirect(created.id);
      await request(app.getHttpServer())
        .post(`${BASE}/${created.id}/publish`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`${BASE}/${created.id}/archive`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      const archivedDetail = await request(app.getHttpServer())
        .get(`${BASE}/${created.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(archivedDetail.body.status).toBe(ProductStatus.ARCHIVED);

      await request(app.getHttpServer())
        .delete(`${BASE}/${created.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`${BASE}/${created.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);

      const audits = await prisma.auditLog.findMany({
        where: { entityId: created.id },
      });
      const actions = audits.map((audit) => audit.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'PRODUCT_CREATED',
          'PRODUCT_UPDATED',
          'PRODUCT_PUBLISHED',
          'PRODUCT_ARCHIVED',
          'PRODUCT_DELETED',
        ]),
      );
      for (const audit of audits) {
        const serializedAudit = JSON.stringify(audit);
        expect(serializedAudit).not.toContain('storageKey');
        expect(serializedAudit).not.toContain('logoKey');
      }
    });

    it('rejects lifecycle conflicts with 409', async () => {
      const operator = await createUser('OPERATOR');

      // Publishing a DRAFT product is allowed only once; a second publish of a
      // PUBLISHED product must conflict.
      const product = await createProductViaApi(operator.accessToken);
      await addVariantDirect(product.id);
      await request(app.getHttpServer())
        .post(`${BASE}/${product.id}/publish`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`${BASE}/${product.id}/publish`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(409);
      await request(app.getHttpServer())
        .post(`${BASE}/${product.id}/archive`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      // Archiving an already-archived product conflicts.
      await request(app.getHttpServer())
        .post(`${BASE}/${product.id}/archive`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(409);
    });

    it('returns 404 for invalid UUID, non-existent and soft-deleted products', async () => {
      const operator = await createUser('OPERATOR');
      const id = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .get(`${BASE}/not-a-uuid`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ name: 'x' })
        .expect(404);
      await request(app.getHttpServer())
        .post(`${BASE}/${id}/publish`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`${BASE}/${id}/archive`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .delete(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
    });

    it('returns 409 for a duplicate slug', async () => {
      const operator = await createUser('OPERATOR');
      const { brandId, categoryId } = await createBrandAndCategory();
      const sharedSlug = `dup-${Date.now()}`;

      await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          name: 'اولی',
          slug: sharedSlug,
          brandId,
          categoryId,
          condition: ProductCondition.NEW,
        })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          name: 'دومی',
          slug: sharedSlug,
          brandId,
          categoryId,
          condition: ProductCondition.NEW,
        });
      expect(second.status).toBe(409);
    });

    it('returns 404 when creating with a missing brand', async () => {
      const operator = await createUser('OPERATOR');
      const { categoryId } = await createBrandAndCategory();
      const missingBrand = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb99';

      await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          name: 'محصول بدون برند',
          brandId: missingBrand,
          categoryId,
          condition: ProductCondition.NEW,
        })
        .expect(404);
    });

    it('rejects creating directly as PUBLISHED with 400', async () => {
      const operator = await createUser('OPERATOR');
      const { brandId, categoryId } = await createBrandAndCategory();

      await request(app.getHttpServer())
        .post(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          name: 'محصول منتشرشده',
          brandId,
          categoryId,
          condition: ProductCondition.NEW,
          status: ProductStatus.PUBLISHED,
        })
        .expect(400);
    });

    it('never leaks sensitive fields in create response', async () => {
      const operator = await createUser('OPERATOR');
      const created = await createProductViaApi(operator.accessToken);
      const serialized = JSON.stringify(created);
      expect(serialized).not.toContain('storageKey');
      expect(serialized).not.toContain('logoKey');
      expect(serialized).not.toContain('createdBy');
      expect(serialized).not.toContain('updatedBy');
      expect(serialized).not.toContain('deletedAt');
    });
  });
});
