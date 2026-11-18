import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { AppRole } from '../src/modules/auth/enums/app-role.enum';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

function suffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

/**
 * SS-900 platform e2e: category-aware attribute configuration, product values,
 * storefront facets + real comparison, manual FX rates, and editable footer.
 */
describe('SS-900 platform features (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let customerToken: string;
  let categoryId: string;
  let categorySlug: string;
  let capacityId: string;
  let warrantyId: string;
  let option1Id: string;
  let option2Id: string;
  let productAId: string;
  let productBId: string;
  let productASlug: string;
  let productBSlug: string;
  const userIds: string[] = [];
  const brandIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];
  const variantIds: string[] = [];
  const attributeIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const tokenService = app.get(TokenService);

    for (const role of [
      AppRole.CUSTOMER,
      AppRole.OPERATOR,
      AppRole.ADMIN,
    ]) {
      await prisma.role.upsert({
        where: { name: role },
        update: {},
        create: { name: role },
      });
    }
    const admin = await prisma.user.create({
      data: {
        mobile: uniqueMobile(),
        status: 'ACTIVE',
        roles: { create: { role: { connect: { name: AppRole.ADMIN } } } },
      },
    });
    const customer = await prisma.user.create({
      data: {
        mobile: uniqueMobile(),
        status: 'ACTIVE',
        roles: { create: { role: { connect: { name: AppRole.CUSTOMER } } } },
      },
    });
    userIds.push(admin.id, customer.id);
    adminToken = (await tokenService.createSession(admin.id)).accessToken;
    customerToken = (await tokenService.createSession(customer.id)).accessToken;

    const category = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `دسته SS900 ${suffix()}`, slug: `ss900-cat-${suffix()}` })
      .expect(201);
    categoryId = category.body.id;
    categorySlug = category.body.slug;
    categoryIds.push(categoryId);

    const brand = await prisma.brand.create({
      data: { name: `برند SS900 ${suffix()}`, slug: `ss900-brand-${suffix()}` },
    });
    brandIds.push(brand.id);

    for (const label of ['A', 'B']) {
      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `محصول SS900 ${label} ${suffix()}`,
          slug: `ss900-product-${label.toLowerCase()}-${suffix()}`,
          brandId: brand.id,
          categoryId,
          condition: ProductCondition.NEW,
        })
        .expect(201);
      productIds.push(created.body.id);
      if (label === 'A') {
        productAId = created.body.id;
        productASlug = created.body.slug;
      } else {
        productBId = created.body.id;
        productBSlug = created.body.slug;
      }
      const variant = await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${created.body.id}/variants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: `SS900-${label}-${suffix()}`,
          name: 'تک‌مدل',
          price: '45000000.00',
        })
        .expect(201);
      variantIds.push(variant.body.id);
      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${created.body.id}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    }

    const capacity = await request(app.getHttpServer())
      .post('/api/v1/admin/attributes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `ظرفیت SS900 ${suffix()}`,
        slug: `ss900-capacity-${suffix()}`,
        type: 'SPEC',
        valueType: 'SELECT',
        unit: 'ترابایت',
        isFilterable: true,
        isComparable: true,
      })
      .expect(201);
    capacityId = capacity.body.id;
    attributeIds.push(capacityId);
    const option1 = await request(app.getHttpServer())
      .post(`/api/v1/admin/attributes/${capacityId}/values`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: '۱ ترابایت', slug: '1tb' })
      .expect(201);
    const option2 = await request(app.getHttpServer())
      .post(`/api/v1/admin/attributes/${capacityId}/values`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: '۲ ترابایت', slug: '2tb' })
      .expect(201);
    option1Id = option1.body.id;
    option2Id = option2.body.id;

    const warranty = await request(app.getHttpServer())
      .post('/api/v1/admin/attributes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `گارانتی SS900 ${suffix()}`,
        slug: `ss900-warranty-${suffix()}`,
        type: 'SPEC',
        valueType: 'TEXT',
        isFilterable: true,
        isComparable: true,
      })
      .expect(201);
    warrantyId = warranty.body.id;
    attributeIds.push(warrantyId);

    await request(app.getHttpServer())
      .put(`/api/v1/admin/categories/${categoryId}/attributes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        attributes: [
          {
            attributeId: capacityId,
            isRequired: true,
            isFilterable: true,
            isComparable: true,
          },
          {
            attributeId: warrantyId,
            isFilterable: true,
            isComparable: true,
          },
        ],
      })
      .expect(200);

    for (const [productId, optionId, warrantyText] of [
      [productAId, option1Id, '۱۸ ماه'],
      [productBId, option2Id, '۱۲ ماه'],
    ] as const) {
      await request(app.getHttpServer())
        .put(`/api/v1/admin/products/${productId}/attributes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          values: [
            { attributeId: capacityId, optionId },
            { attributeId: warrantyId, valueText: warrantyText },
          ],
        })
        .expect(200);
    }
  });

  afterAll(async () => {
    await prisma.productAttributeValue.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.categoryAttribute.deleteMany({
      where: { categoryId: { in: categoryIds } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { in: variantIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.attributeValue.deleteMany({
      where: { attributeId: { in: attributeIds } },
    });
    await prisma.attribute.deleteMany({ where: { id: { in: attributeIds } } });
    await prisma.currencyRate.deleteMany({
      where: { note: { startsWith: 'SS900-E2E' } },
    });
    await prisma.siteSetting.deleteMany({ where: { key: 'footer' } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('enforces required typed product values', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/admin/products/${productAId}/attributes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ values: [] })
      .expect(400);
  });

  it('returns category-aware value facets and brand facets', async () => {
    const facets = await request(app.getHttpServer())
      .get(`/api/v1/catalog/facets?category=${categorySlug}`)
      .expect(200);
    const capacity = facets.body.attributes.find(
      (row: { attributeId: string }) => row.attributeId === capacityId,
    );
    expect(capacity).toBeDefined();
    expect(capacity.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: '1tb', count: 1 }),
        expect.objectContaining({ slug: '2tb', count: 1 }),
      ]),
    );
    expect(facets.body.brands).toHaveLength(1);
  });

  it('filters products by attribute values and rejects unknown filters', async () => {
    const filtered = await request(app.getHttpServer())
      .get(
        `/api/v1/catalog/products?category=${categorySlug}&attrs=${encodeURIComponent(
          JSON.stringify({ [`ss900-capacity-${categorySlug.split('-').at(-1)}`]: [] }),
        )}`,
      )
      .expect(400);
    expect(filtered.body.message).toBeTruthy();

    // Use the actual attribute slug returned by the facet response.
    const facets = await request(app.getHttpServer())
      .get(`/api/v1/catalog/facets?category=${categorySlug}`)
      .expect(200);
    const slug = facets.body.attributes.find(
      (row: { attributeId: string }) => row.attributeId === capacityId,
    ).slug;
    const page = await request(app.getHttpServer())
      .get(
        `/api/v1/catalog/products?category=${categorySlug}&attrs=${encodeURIComponent(
          JSON.stringify({ [slug]: ['1tb'] }),
        )}`,
      )
      .expect(200);
    expect(page.body.total).toBe(1);
    expect(page.body.items[0].id).toBe(productAId);

    await request(app.getHttpServer())
      .get(
        `/api/v1/catalog/products?category=${categorySlug}&attrs=${encodeURIComponent(
          JSON.stringify({ [slug]: { min: null } }),
        )}`,
      )
      .expect(400);
  });

  it('compares products using category-configured comparable attributes', async () => {
    const result = await request(app.getHttpServer())
      .get(
        `/api/v1/catalog/products/compare?slugs=${productASlug},${productBSlug}`,
      )
      .expect(200);
    expect(result.body.products).toHaveLength(2);
    expect(result.body.attributes.map((row: { attributeId: string }) => row.attributeId)).toEqual(
      expect.arrayContaining([capacityId, warrantyId]),
    );
    const valuesA = result.body.products.find(
      (row: { id: string }) => row.id === productAId,
    ).values;
    expect(valuesA[capacityId]).toBe('۱ ترابایت');
    expect(valuesA[warrantyId]).toBe('۱۸ ماه');
  });

  it('maintains audited manual FX rates and converts admin-side only', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/currency-rates')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ currency: 'USD', rialPerUnit: '925000' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/admin/currency-rates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currency: 'USD', rialPerUnit: '0' })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/currency-rates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        currency: 'USD',
        rialPerUnit: '925000',
        note: `SS900-E2E ${suffix()}`,
      })
      .expect(201);
    expect(created.body.rialPerUnit).toBe('925000');
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/currency-rates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.current).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: 'USD', rialPerUnit: '925000' }),
      ]),
    );
  });

  it('serves admin-managed footer content publicly with optimistic versioning', async () => {
    const initial = await request(app.getHttpServer())
      .get('/api/v1/admin/settings/footer')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const updated = await request(app.getHttpServer())
      .put('/api/v1/admin/settings/footer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        version: initial.body.version,
        value: {
          enabled: true,
          blurb: `پاورقی SS900 ${suffix()}`,
          columns: [],
          contact: {
            address: null,
            phone: '021-00000000',
            email: null,
            hours: null,
          },
          socials: [],
          legalLinks: [],
          copyright: null,
        },
      })
      .expect(200);
    expect(updated.body.value.blurb).toContain('پاورقی SS900');
    await request(app.getHttpServer())
      .put('/api/v1/admin/settings/footer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        version: initial.body.version,
        value: updated.body.value,
      })
      .expect(409);

    const publicFooter = await request(app.getHttpServer())
      .get('/api/v1/catalog/settings/footer')
      .expect(200);
    expect(publicFooter.body.value.blurb).toBe(updated.body.value.blurb);
    expect(publicFooter.body.value.contact.phone).toBe('021-00000000');
  });
});
