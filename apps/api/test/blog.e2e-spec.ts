import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BLOG_BASE = '/api/v1/blog';

/** DTO key pins — any shape change must update these lists. */
const CATEGORY_KEYS = ['description', 'id', 'name', 'slug', 'sortOrder'];
const CARD_KEYS = [
  'authorName',
  'category',
  'coverImageUrl',
  'excerpt',
  'id',
  'publishedAt',
  'slug',
  'title',
];
const DETAIL_KEYS = [
  ...CARD_KEYS,
  'content',
  'metaDescription',
  'metaTitle',
  'status',
  'statusFa',
];
const LIST_KEYS = ['items', 'limit', 'page', 'total'];

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toLowerCase();
}

/**
 * Blog CMS API (SS-238, master plan §5.10). Proves the publication
 * contract: public reads serve PUBLISHED rows only (drafts 404 like
 * missing rows), operator writes are OPERATOR/ADMIN (401 anonymous,
 * 403 non-operator), slugs collide with 409, unknown categories 404,
 * bodies are sanitized before storage, archiving unpublishes, and
 * non-empty categories refuse deletion.
 */
describe('Blog API (SS-238) (e2e)', () => {
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
    await prisma.blogCategory.deleteMany({ where: { id: { in: categoryIds } } });
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

  it('serves empty public lists and 404s unknown slugs', async () => {
    const list = await request(app.getHttpServer()).get(BLOG_BASE).expect(200);
    expect(Object.keys(list.body).sort()).toEqual([...LIST_KEYS].sort());
    expect(list.body).toMatchObject({ items: [], total: 0, page: 1 });

    const categories = await request(app.getHttpServer())
      .get(`${BLOG_BASE}/categories`)
      .expect(200);
    expect(Array.isArray(categories.body)).toBe(true);

    await request(app.getHttpServer())
      .get(`${BLOG_BASE}/no-such-article`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${BLOG_BASE}?category=no-such-category`)
      .expect(404);
  });

  it('rejects anonymous writes with 401 and non-operators with 403', async () => {
    const customer = await createUserWithToken();
    const id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    await request(app.getHttpServer()).post(BLOG_BASE).send({}).expect(401);
    await request(app.getHttpServer())
      .patch(`${BLOG_BASE}/${id}`)
      .send({})
      .expect(401);
    await request(app.getHttpServer()).delete(`${BLOG_BASE}/${id}`).expect(401);
    await request(app.getHttpServer())
      .post(`${BLOG_BASE}/categories`)
      .send({})
      .expect(401);

    await request(app.getHttpServer())
      .post(BLOG_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ title: 'x', content: 'y' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`${BLOG_BASE}/categories`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ name: 'x' })
      .expect(403);
  });

  it('creates DRAFT posts invisibly, then publishes them', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const auth = { Authorization: `Bearer ${operator.token}` };
    const suffix = uniqueSuffix();

    const category = await request(app.getHttpServer())
      .post(`${BLOG_BASE}/categories`)
      .set(auth)
      .send({ slug: `cat-${suffix}`, name: `دسته ${suffix}` })
      .expect(201);
    expect(Object.keys(category.body).sort()).toEqual([...CATEGORY_KEYS].sort());
    categoryIds.push(category.body.id);

    const draft = await request(app.getHttpServer())
      .post(BLOG_BASE)
      .set(auth)
      .send({
        slug: `post-${suffix}`,
        categoryId: category.body.id,
        title: `مطلب ${suffix}`,
        excerpt: 'خلاصه',
        content: '<p>متن مطلب</p><script>alert(1)</script>',
        authorName: 'تحریریه',
        metaTitle: 'عنوان سئو',
        metaDescription: 'توضیح سئو',
      })
      .expect(201);
    expect(Object.keys(draft.body).sort()).toEqual([...DETAIL_KEYS].sort());
    expect(draft.body).toMatchObject({
      slug: `post-${suffix}`,
      status: 'DRAFT',
      statusFa: 'پیش‌نویس',
      publishedAt: null,
      category: { slug: `cat-${suffix}`, name: `دسته ${suffix}` },
    });
    // Sanitizer strips the script before storage.
    expect(draft.body.content).not.toContain('<script>');
    expect(draft.body.content).toContain('متن مطلب');
    postIds.push(draft.body.id);

    // DRAFT is invisible publicly: list stays empty, slug 404s.
    const hidden = await request(app.getHttpServer()).get(BLOG_BASE).expect(200);
    expect(hidden.body.total).toBe(0);
    await request(app.getHttpServer())
      .get(`${BLOG_BASE}/post-${suffix}`)
      .expect(404);

    // Publish: publishedAt stamps automatically.
    const published = await request(app.getHttpServer())
      .patch(`${BLOG_BASE}/${draft.body.id}`)
      .set(auth)
      .send({ status: 'PUBLISHED' })
      .expect(200);
    expect(published.body).toMatchObject({
      status: 'PUBLISHED',
      statusFa: 'منتشر شده',
    });
    expect(typeof published.body.publishedAt).toBe('string');

    const visible = await request(app.getHttpServer())
      .get(`${BLOG_BASE}/post-${suffix}`)
      .expect(200);
    expect(Object.keys(visible.body).sort()).toEqual([...DETAIL_KEYS].sort());
    expect(visible.body).toMatchObject({
      title: `مطلب ${suffix}`,
      authorName: 'تحریریه',
    });

    const listed = await request(app.getHttpServer()).get(BLOG_BASE).expect(200);
    expect(listed.body.total).toBe(1);
    expect(Object.keys(listed.body.items[0]).sort()).toEqual([...CARD_KEYS].sort());

    const filtered = await request(app.getHttpServer())
      .get(`${BLOG_BASE}?category=cat-${suffix}`)
      .expect(200);
    expect(filtered.body.total).toBe(1);
  });

  it('rejects duplicate slugs, unknown categories, and bad timestamps', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const auth = { Authorization: `Bearer ${operator.token}` };
    const suffix = uniqueSuffix();

    const created = await request(app.getHttpServer())
      .post(BLOG_BASE)
      .set(auth)
      .send({ slug: `dup-${suffix}`, title: 'اول', content: '<p>a</p>' })
      .expect(201);
    postIds.push(created.body.id);

    await request(app.getHttpServer())
      .post(BLOG_BASE)
      .set(auth)
      .send({ slug: `dup-${suffix}`, title: 'دوم', content: '<p>b</p>' })
      .expect(409);

    await request(app.getHttpServer())
      .post(BLOG_BASE)
      .set(auth)
      .send({
        title: 'دسته ناموجود',
        content: '<p>x</p>',
        categoryId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      })
      .expect(404);

    await request(app.getHttpServer())
      .post(BLOG_BASE)
      .set(auth)
      .send({ title: 'زمان بد', content: '<p>x</p>', publishedAt: 'not-a-date' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`${BLOG_BASE}/${created.body.id}`)
      .set(auth)
      .send({ slug: `dup-${suffix}` })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`${BLOG_BASE}/${created.body.id}`)
      .set(auth)
      .send({ slug: `dup-${suffix}` })
      .expect(200);
  });

  it('renames slugs cleanly and archives back to invisible', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const auth = { Authorization: `Bearer ${operator.token}` };
    const suffix = uniqueSuffix();

    const created = await request(app.getHttpServer())
      .post(BLOG_BASE)
      .set(auth)
      .send({
        slug: `old-${suffix}`,
        title: 'تغییر slug',
        content: '<p>x</p>',
        status: 'PUBLISHED',
      })
      .expect(201);
    postIds.push(created.body.id);
    await request(app.getHttpServer()).get(`${BLOG_BASE}/old-${suffix}`).expect(200);

    const renamed = await request(app.getHttpServer())
      .patch(`${BLOG_BASE}/${created.body.id}`)
      .set(auth)
      .send({ slug: `new-${suffix}` })
      .expect(200);
    expect(renamed.body.slug).toBe(`new-${suffix}`);
    await request(app.getHttpServer()).get(`${BLOG_BASE}/old-${suffix}`).expect(404);
    await request(app.getHttpServer()).get(`${BLOG_BASE}/new-${suffix}`).expect(200);

    const archived = await request(app.getHttpServer())
      .delete(`${BLOG_BASE}/${created.body.id}`)
      .set(auth)
      .expect(200);
    expect(archived.body.status).toBe('DRAFT');
    await request(app.getHttpServer()).get(`${BLOG_BASE}/new-${suffix}`).expect(404);
  });

  it('refuses to delete a category with posts, then deletes when empty', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const auth = { Authorization: `Bearer ${operator.token}` };
    const suffix = uniqueSuffix();

    const category = await request(app.getHttpServer())
      .post(`${BLOG_BASE}/categories`)
      .set(auth)
      .send({ slug: `del-${suffix}`, name: `حذف ${suffix}` })
      .expect(201);
    categoryIds.push(category.body.id);

    const post = await request(app.getHttpServer())
      .post(BLOG_BASE)
      .set(auth)
      .send({
        title: 'وابسته',
        content: '<p>x</p>',
        categoryId: category.body.id,
        status: 'PUBLISHED',
      })
      .expect(201);
    postIds.push(post.body.id);

    await request(app.getHttpServer())
      .delete(`${BLOG_BASE}/categories/${category.body.id}`)
      .set(auth)
      .expect(409);

    await request(app.getHttpServer())
      .patch(`${BLOG_BASE}/${post.body.id}`)
      .set(auth)
      .send({ categoryId: null })
      .expect(200);

    const deleted = await request(app.getHttpServer())
      .delete(`${BLOG_BASE}/categories/${category.body.id}`)
      .set(auth)
      .expect(200);
    expect(deleted.body).toEqual({ id: category.body.id });
  });
});
