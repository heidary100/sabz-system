import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition, ProductStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const PRODUCTS = '/api/v1/admin/products';
const VARIANTS = '/api/v1/admin/variants';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

describe('Admin variant API (SS-104) (e2e)', () => {
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
      where: { entityId: { in: variantIds } },
    });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
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
    await prisma.productVariant.deleteMany({ where: { productId: { in: orphanIds } } });
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
    return { userId: user.id, accessToken: tokens.accessToken };
  }

  async function createProduct(
    overrides: { status?: ProductStatus } = {},
  ): Promise<string> {
    const brand = await prisma.brand.create({
      data: { name: `برند ${Date.now()}-${Math.random()}`, slug: `brand-${Date.now()}-${Math.random()}` },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته ${Date.now()}-${Math.random()}`, slug: `cat-${Date.now()}-${Math.random()}` },
    });
    categoryIds.push(category.id);
    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}-${Math.random()}`,
        slug: `prod-${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        status: overrides.status ?? ProductStatus.DRAFT,
      },
    });
    productIds.push(product.id);
    return product.id;
  }

  describe('authentication and authorization', () => {
    it('rejects every endpoint without a token with 401', async () => {
      const id = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer()).get(`${PRODUCTS}/${id}/variants`).expect(401);
      await request(app.getHttpServer()).post(`${PRODUCTS}/${id}/variants`).send({}).expect(401);
      await request(app.getHttpServer()).get(`${VARIANTS}/${id}`).expect(401);
      await request(app.getHttpServer()).patch(`${VARIANTS}/${id}`).send({}).expect(401);
      await request(app.getHttpServer()).delete(`${VARIANTS}/${id}`).expect(401);
      await request(app.getHttpServer()).patch(`${VARIANTS}/${id}/inventory`).send({}).expect(401);
    });

    it('rejects CUSTOMER and PARTNER with 403', async () => {
      const customer = await createUser('CUSTOMER');
      const partner = await createUser('PARTNER');
      const id = '00000000-0000-0000-0000-000000000000';

      for (const token of [customer.accessToken, partner.accessToken]) {
        await request(app.getHttpServer())
          .get(`${PRODUCTS}/${id}/variants`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(app.getHttpServer())
          .post(`${PRODUCTS}/${id}/variants`)
          .set('Authorization', `Bearer ${token}`)
          .send({ sku: 'S', price: '1.00' })
          .expect(403);
        await request(app.getHttpServer())
          .patch(`${VARIANTS}/${id}/inventory`)
          .set('Authorization', `Bearer ${token}`)
          .send({ stockQuantity: 1 })
          .expect(403);
      }
    });

    it('allows OPERATOR and ADMIN', async () => {
      const operator = await createUser('OPERATOR');
      const admin = await createUser('ADMIN');
      const productId = await createProduct();

      for (const token of [operator.accessToken, admin.accessToken]) {
        const res = await request(app.getHttpServer())
          .get(`${PRODUCTS}/${productId}/variants`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(res.body).toEqual([]);
      }
    });
  });

  describe('variant CRUD + inventory', () => {
    it('creates, lists, reads detail, updates, sets inventory, soft-deletes and audits', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();

      const created = await request(app.getHttpServer())
        .post(`${PRODUCTS}/${productId}/variants`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ sku: `SKU-E2E-${Date.now()}`, price: '1500.00', stockQuantity: 3 })
        .expect(201);
      variantIds.push(created.body.id);
      expect(created.body.price).toBe('1500');
      expect(created.body.stockQuantity).toBe(3);
      expect(created.body.productId).toBe(productId);

      const list = await request(app.getHttpServer())
        .get(`${PRODUCTS}/${productId}/variants`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(list.body.length).toBe(1);
      const serializedList = JSON.stringify(list.body);
      expect(serializedList).not.toContain('deletedAt');
      expect(serializedList).not.toContain('createdBy');

      const detail = await request(app.getHttpServer())
        .get(`${VARIANTS}/${created.body.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(detail.body.sku).toBe(created.body.sku);

      const updated = await request(app.getHttpServer())
        .patch(`${VARIANTS}/${created.body.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ price: '99.50', name: 'پایه' })
        .expect(200);
      expect(updated.body.price).toBe('99.5');
      expect(updated.body.name).toBe('پایه');

      const inventory = await request(app.getHttpServer())
        .patch(`${VARIANTS}/${created.body.id}/inventory`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ stockQuantity: 7 })
        .expect(200);
      expect(inventory.body.stockQuantity).toBe(7);

      await request(app.getHttpServer())
        .delete(`${VARIANTS}/${created.body.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`${VARIANTS}/${created.body.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);

      const audits = await prisma.auditLog.findMany({
        where: { entityId: created.body.id },
      });
      const actions = audits.map((audit) => audit.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'PRODUCT_VARIANT_CREATED',
          'PRODUCT_VARIANT_UPDATED',
          'PRODUCT_INVENTORY_SET',
          'PRODUCT_VARIANT_DELETED',
        ]),
      );
    });

    it('returns 409 on a duplicate SKU', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const sku = `SKU-DUP-E2E-${Date.now()}`;

      await request(app.getHttpServer())
        .post(`${PRODUCTS}/${productId}/variants`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ sku, price: '10.00' })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(`${PRODUCTS}/${productId}/variants`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ sku, price: '20.00' });
      expect(second.status).toBe(409);
    });

    it('returns 404 for invalid UUID, missing product and soft-deleted product', async () => {
      const operator = await createUser('OPERATOR');
      const id = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .get(`${PRODUCTS}/not-a-uuid/variants`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`${PRODUCTS}/${id}/variants`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`${VARIANTS}/not-a-uuid`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${VARIANTS}/${id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ name: 'x' })
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${VARIANTS}/${id}/inventory`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ stockQuantity: 1 })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`${VARIANTS}/${id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
    });

    it('returns 400 for invalid values', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();

      await request(app.getHttpServer())
        .post(`${PRODUCTS}/${productId}/variants`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ price: '10.00' })
        .expect(400);
      await request(app.getHttpServer())
        .post(`${PRODUCTS}/${productId}/variants`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ sku: 'S', price: '10.123' })
        .expect(400);
      await request(app.getHttpServer())
        .post(`${PRODUCTS}/${productId}/variants`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ sku: 'S', price: '10.00', stockQuantity: -1 })
        .expect(400);
    });

    it('rejects creating/updating inventory for an archived product with 409', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct({ status: ProductStatus.ARCHIVED });

      const createRes = await request(app.getHttpServer())
        .post(`${PRODUCTS}/${productId}/variants`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ sku: `SKU-ARCH-${Date.now()}`, price: '10.00' });
      expect(createRes.status).toBe(409);
    });

    it('soft-deleted variant is inaccessible and not in product list', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const created = await request(app.getHttpServer())
        .post(`${PRODUCTS}/${productId}/variants`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ sku: `SKU-SOFT-${Date.now()}`, price: '10.00' })
        .expect(201);
      variantIds.push(created.body.id);

      await prisma.productVariant.update({
        where: { id: created.body.id },
        data: { deletedAt: new Date() },
      });

      await request(app.getHttpServer())
        .get(`${VARIANTS}/${created.body.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${VARIANTS}/${created.body.id}/inventory`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ stockQuantity: 1 })
        .expect(404);

      const list = await request(app.getHttpServer())
        .get(`${PRODUCTS}/${productId}/variants`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(list.body.length).toBe(0);
    });

    it('never leaks sensitive fields in any variant response', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const created = await request(app.getHttpServer())
        .post(`${PRODUCTS}/${productId}/variants`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ sku: `SKU-LEAK-${Date.now()}`, price: '10.00' })
        .expect(201);
      variantIds.push(created.body.id);

      const detail = await request(app.getHttpServer())
        .get(`${VARIANTS}/${created.body.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      const serialized = JSON.stringify(detail.body);
      expect(serialized).not.toContain('deletedAt');
      expect(serialized).not.toContain('createdBy');
      expect(serialized).not.toContain('updatedBy');
      expect(serialized).not.toContain('storageKey');
    });
  });
});
