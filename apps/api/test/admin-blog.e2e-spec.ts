import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const ADMIN_BASE = '/api/v1/admin/blog/posts';
const BLOG_BASE = '/api/v1/blog';

/** DTO key pins — any shape change must update these lists. */
const ADMIN_BLOG_LIST_KEYS = ['items', 'limit', 'page', 'total'];
const ADMIN_BLOG_ITEM_KEYS = [
  'authorName',
  'category',
  'coverImageUrl',
  'excerpt',
  'id',
  'publishedAt',
  'slug',
  'status',
  'statusFa',
  'title',
];

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toLowerCase();
}

/**
 * Operator blog queue (SS-240E). Proves the admin read contract: anonymous
 * callers get 401, customers get 403, the queue lists DRAFT and PUBLISHED
 * together newest-first with pinned keys (public reads stay PUBLISHED-only),
 * the status filter and pagination are honoured, invalid statuses 400, and
 * the detail route serves drafts by id (unknown ids 404).
 */
describe('Admin blog API (SS-240E) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const roleIds: Record<string, string> = {};
  const categoryIds: string[] = [];
  const postIds: string[] = [];

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
    process.env.WATERMARK_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);

    for (const role of ['OPERATOR', 'ADMIN']) {
      roleIds[role] = await seedRole(role);
    }
  });

  afterAll(async () => {
    await prisma.blogPost.deleteMany({ where: { id: { in: postIds } } });
    await prisma.blogCategory.deleteMany({
      where: { id: { in: categoryIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: [...userIds, ...postIds, ...categoryIds] } },
          { userId: { in: userIds } },
        ],
      },
    });
    await prisma.userSession.deleteMany({
      where: { user: { mobile: { in: mobiles } } },
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  async function createUserWithToken(
    role?: string,
  ): Promise<{ userId: string; token: string }> {
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
    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, token: tokens.accessToken };
  }

  it('rejects anonymous callers with 401 and customers with 403', async () => {
    await request(app.getHttpServer()).get(ADMIN_BASE).expect(401);

    const customer = await createUserWithToken();
    await request(app.getHttpServer())
      .get(ADMIN_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);
  });

  it('lists drafts alongside published posts, newest first', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const suffix = uniqueSuffix();

    const category = await request(app.getHttpServer())
      .post(`${BLOG_BASE}/categories`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ slug: `cat-${suffix}`, name: `دسته ${suffix}` })
      .expect(201);
    categoryIds.push(category.body.id as string);

    // Older: published. Newer: draft. The draft must lead the admin queue
    // while staying invisible on the public list.
    const published = await request(app.getHttpServer())
      .post(BLOG_BASE)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({
        slug: `post-pub-${suffix}`,
        categoryId: category.body.id,
        title: `مطلب منتشر ${suffix}`,
        content: '<p>متن منتشر.</p>',
        status: 'PUBLISHED',
      })
      .expect(201);
    postIds.push(published.body.id as string);
    const draft = await request(app.getHttpServer())
      .post(BLOG_BASE)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({
        slug: `post-draft-${suffix}`,
        categoryId: category.body.id,
        title: `مطلب پیش‌نویس ${suffix}`,
        content: '<p>متن پیش‌نویس.</p>',
      })
      .expect(201);
    postIds.push(draft.body.id as string);

    // Default queue (no status) = everything with pinned keys, newest first.
    await request(app.getHttpServer())
      .get(ADMIN_BASE)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(Object.keys(res.body).sort()).toEqual(ADMIN_BLOG_LIST_KEYS);
        expect(res.body).toMatchObject({ total: 2, page: 1, limit: 20 });
        expect(res.body.items).toHaveLength(2);
        expect(Object.keys(res.body.items[0]).sort()).toEqual(
          ADMIN_BLOG_ITEM_KEYS,
        );
        expect(res.body.items[0].id).toBe(draft.body.id);
        expect(res.body.items[1].id).toBe(published.body.id);
        expect(res.body.items[0]).toMatchObject({
          slug: `post-draft-${suffix}`,
          status: 'DRAFT',
          statusFa: 'پیش‌نویس',
        });
        expect(res.body.items[1]).toMatchObject({
          slug: `post-pub-${suffix}`,
          status: 'PUBLISHED',
          statusFa: 'منتشر شده',
        });
      });

    // Status filters split the queue.
    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}?status=DRAFT`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(res.body.total).toBe(1);
        expect(res.body.items[0].id).toBe(draft.body.id);
      });
    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}?status=PUBLISHED`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(res.body.total).toBe(1);
        expect(res.body.items[0].id).toBe(published.body.id);
      });

    // Invalid status → 400 with a Persian message.
    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}?status=BOGUS`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(400);

    // Pagination is honoured.
    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}?page=2&limit=1`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({ total: 2, page: 2, limit: 1 });
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].id).toBe(published.body.id);
      });

    // Public list still hides the draft.
    await request(app.getHttpServer())
      .get(BLOG_BASE)
      .expect(200)
      .then((res) => {
        const slugs = (res.body.items as Array<{ slug: string }>).map(
          (item) => item.slug,
        );
        expect(slugs).toContain(`post-pub-${suffix}`);
        expect(slugs).not.toContain(`post-draft-${suffix}`);
      });
  });

  it('serves drafts by id and 404s unknown ids', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const suffix = uniqueSuffix();

    const draft = await request(app.getHttpServer())
      .post(BLOG_BASE)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({
        slug: `post-detail-${suffix}`,
        title: `جزئیات ${suffix}`,
        content: '<p>متن.</p>',
      })
      .expect(201);
    postIds.push(draft.body.id as string);

    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}/${draft.body.id}`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({
          id: draft.body.id,
          slug: `post-detail-${suffix}`,
          status: 'DRAFT',
        });
      });

    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}/${draft.body.id}`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}/9a2f7c3e-1b4d-4e6f-8a0c-2d5f7b9e1a3c`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(404);
  });
});
