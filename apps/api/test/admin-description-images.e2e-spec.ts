import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import { createServer } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BASE = '/api/v1/admin/products';
const PUBLIC = '/api/v1/description-images';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
}

async function withImageServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolvePromise) =>
    server.listen(0, '127.0.0.1', resolvePromise),
  );
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('no port');
  }
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

describe('Admin description images API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const roleIds: Record<string, string> = {};
  const brandIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];

  async function seedRole(name: string): Promise<string> {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) return existing.id;
    try {
      const created = await prisma.role.create({ data: { name } });
      return created.id;
    } catch {
      const row = await prisma.role.findUnique({ where: { name } });
      if (row) return row.id;
      throw new Error(`Failed to seed role ${name}`);
    }
  }

  beforeAll(async () => {
    // This suite exercises the HTTP/auth/import flow with fixture bytes; the
    // watermark pipeline is covered by unit/integration specs, so it is
    // disabled here (mirrors admin-product-media.e2e-spec).
    process.env.WATERMARK_ENABLED = 'false';
    // Allow the from-url import test to fetch from a local test server.
    process.env.DESCRIPTION_IMAGE_IMPORT_ALLOW_PRIVATE = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);
    for (const role of ['CUSTOMER', 'OPERATOR', 'ADMIN']) {
      roleIds[role] = await seedRole(role);
    }
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: productIds } },
    });
    const orphanProducts = await prisma.product.findMany({
      where: {
        OR: [{ brandId: { in: brandIds } }, { categoryId: { in: categoryIds } }],
      },
      select: { id: true },
    });
    const orphanIds = orphanProducts.map((row) => row.id);
    await prisma.productMedia.deleteMany({ where: { productId: { in: orphanIds } } });
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
    await prisma.userSession.deleteMany({ where: { user: { mobile: { in: mobiles } } } });
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

  async function createProduct(token: string): Promise<string> {
    const brand = await prisma.brand.create({
      data: { name: `برند ${Date.now()}-${Math.random()}`, slug: `b-${Date.now()}-${Math.random()}` },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته ${Date.now()}-${Math.random()}`, slug: `c-${Date.now()}-${Math.random()}` },
    });
    categoryIds.push(category.id);
    const res = await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `محصول ${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
      })
      .expect(201);
    productIds.push(res.body.id);
    return res.body.id;
  }

  it('rejects upload without a token with 401', async () => {
    const id = '00000000-0000-0000-0000-000000000000';
    await request(app.getHttpServer())
      .post(`${BASE}/${id}/description-images`)
      .attach('file', jpegBuffer(), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(401);
  });

  it('rejects CUSTOMER with 403', async () => {
    const customer = await createUser('CUSTOMER');
    const id = '00000000-0000-0000-0000-000000000000';
    await request(app.getHttpServer())
      .post(`${BASE}/${id}/description-images`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .attach('file', jpegBuffer(), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(403);
  });

  it('rejects a non-image file with 400', async () => {
    const operator = await createUser('OPERATOR');
    const productId = await createProduct(operator.accessToken);
    await request(app.getHttpServer())
      .post(`${BASE}/${productId}/description-images`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .attach('file', Buffer.from('not an image'), {
        filename: 'x.txt',
        contentType: 'text/plain',
      })
      .expect(400);
  });

  it('returns 404 for a missing product', async () => {
    const operator = await createUser('OPERATOR');
    const id = '00000000-0000-0000-0000-000000000000';
    await request(app.getHttpServer())
      .post(`${BASE}/${id}/description-images`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .attach('file', jpegBuffer(), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(404);
  });

  it('uploads an image, serves it publicly, and returns a safe relative URL', async () => {
    const operator = await createUser('OPERATOR');
    const productId = await createProduct(operator.accessToken);

    const upload = await request(app.getHttpServer())
      .post(`${BASE}/${productId}/description-images`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .attach('file', jpegBuffer(), { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(upload.body.url).toMatch(
      /^\/api\/v1\/description-images\/[0-9a-f-]{36}\.jpg$/,
    );
    const fileName = upload.body.url.split('/').pop();

    const served = await request(app.getHttpServer())
      .get(`${PUBLIC}/${fileName}`)
      .expect(200);
    expect(served.headers['content-type']).toContain('image/jpeg');
    expect(served.headers['cache-control']).toContain('public');

    // An invalid file name is never routed to storage.
    await request(app.getHttpServer()).get(`${PUBLIC}/../../etc/passwd`).expect(404);
    await request(app.getHttpServer()).get(`${PUBLIC}/garbage.txt`).expect(404);
  });

  it('audits the upload', async () => {
    const operator = await createUser('OPERATOR');
    const productId = await createProduct(operator.accessToken);
    const upload = await request(app.getHttpServer())
      .post(`${BASE}/${productId}/description-images`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .attach('file', jpegBuffer(), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const audits = await prisma.auditLog.findMany({
      where: { action: 'PRODUCT_DESCRIPTION_IMAGE_UPLOADED' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    expect(
      audits.some((row) => (row.after as { url?: string } | null)?.url === upload.body.url),
    ).toBe(true);
  });

  it('imports an external URL into controlled storage', async () => {
    await withImageServer(
      (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(jpegBuffer());
      },
      async (base) => {
        const operator = await createUser('OPERATOR');
        const productId = await createProduct(operator.accessToken);

        const imported = await request(app.getHttpServer())
          .post(`${BASE}/${productId}/description-images/from-url`)
          .set('Authorization', `Bearer ${operator.accessToken}`)
          .send({ url: `${base}/remote.jpg` })
          .expect(201);

        expect(imported.body.url).toMatch(
          /^\/api\/v1\/description-images\/[0-9a-f-]{36}\.jpg$/,
        );
        const fileName = imported.body.url.split('/').pop();
        const served = await request(app.getHttpServer())
          .get(`${PUBLIC}/${fileName}`)
          .expect(200);
        expect(served.headers['content-type']).toContain('image/jpeg');

        const audits = await prisma.auditLog.findMany({
          where: { action: 'PRODUCT_DESCRIPTION_IMAGE_IMPORTED' },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });
        expect(
          audits.some(
            (row) => (row.after as { url?: string } | null)?.url === imported.body.url,
          ),
        ).toBe(true);
      },
    );
  });

  it('rejects a non-http(s) import URL with 400', async () => {
    const operator = await createUser('OPERATOR');
    const productId = await createProduct(operator.accessToken);
    await request(app.getHttpServer())
      .post(`${BASE}/${productId}/description-images/from-url`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ url: 'javascript:alert(1)' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${BASE}/${productId}/description-images/from-url`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ url: 'file:///etc/passwd' })
      .expect(400);
  });
});