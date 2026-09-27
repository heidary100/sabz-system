import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const ADDRESSES_BASE = '/api/v1/addresses';

/** Address DTO keys, pinned — any shape change must update this list. */
const ADDRESS_KEYS = [
  'address',
  'city',
  'createdAt',
  'fullName',
  'id',
  'isDefault',
  'label',
  'phone',
  'postalCode',
  'province',
];

const ADDRESS_LIST_KEYS = ['items'];

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

const VALID_ADDRESS = {
  label: 'خانه',
  fullName: 'علی احمدی',
  phone: '09123456789',
  province: 'مازندران',
  city: 'ساری',
  address: 'ساری، بلوار پاسداران، روبروی مرکز تخصصی پرتو',
  postalCode: '4814938662',
};

/**
 * Customer address-book API (SS-233). Proves the authed contract: anonymous
 * callers get 401 on every route, the first address becomes the default,
 * explicit promotion demotes siblings, deleting the default promotes the
 * oldest sibling, unknown removes report not-removed, and each user sees
 * only their own book shaped with pinned DTO keys.
 */
describe('Addresses API (SS-233) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];

  async function createUserWithToken(): Promise<{ userId: string; token: string }> {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: { mobile, status: 'ACTIVE' },
    });
    userIds.push(user.id);
    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, token: tokens.accessToken };
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
  });

  afterAll(async () => {
    // Addresses cascade from users.
    await prisma.userSession.deleteMany({
      where: { user: { mobile: { in: mobiles } } },
    });
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  it('rejects anonymous callers with 401 on every route', async () => {
    const id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    await request(app.getHttpServer()).get(ADDRESSES_BASE).expect(401);
    await request(app.getHttpServer())
      .post(ADDRESSES_BASE)
      .send(VALID_ADDRESS)
      .expect(401);
    await request(app.getHttpServer()).patch(`${ADDRESSES_BASE}/${id}`).send({}).expect(401);
    await request(app.getHttpServer()).delete(`${ADDRESSES_BASE}/${id}`).expect(401);
  });

  it('creates, lists, promotes, and removes with pinned DTO keys', async () => {
    const customer = await createUserWithToken();

    const first = await request(app.getHttpServer())
      .post(ADDRESSES_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send(VALID_ADDRESS)
      .expect(201);
    expect(Object.keys(first.body).sort()).toEqual(ADDRESS_KEYS);
    expect(first.body).toMatchObject({ ...VALID_ADDRESS, isDefault: true });

    const second = await request(app.getHttpServer())
      .post(ADDRESSES_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ ...VALID_ADDRESS, label: 'محل کار', postalCode: '4814938663' })
      .expect(201);
    expect(second.body.isDefault).toBe(false);

    const listed = await request(app.getHttpServer())
      .get(ADDRESSES_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(Object.keys(listed.body).sort()).toEqual(ADDRESS_LIST_KEYS);
    expect(listed.body.items).toHaveLength(2);
    // Default sorts first.
    expect(listed.body.items[0].id).toBe(first.body.id);

    // Promote the second: the first is demoted.
    const promoted = await request(app.getHttpServer())
      .patch(`${ADDRESSES_BASE}/${second.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ isDefault: true })
      .expect(200);
    expect(promoted.body.isDefault).toBe(true);

    const relisted = await request(app.getHttpServer())
      .get(ADDRESSES_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    const defaults = relisted.body.items.filter(
      (item: { isDefault: boolean }) => item.isDefault,
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(second.body.id);

    // Deleting the default promotes the oldest sibling.
    await request(app.getHttpServer())
      .delete(`${ADDRESSES_BASE}/${second.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200)
      .then((res) => expect(res.body).toEqual({ removed: true }));

    const afterDelete = await request(app.getHttpServer())
      .get(ADDRESSES_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(afterDelete.body.items).toHaveLength(1);
    expect(afterDelete.body.items[0]).toMatchObject({
      id: first.body.id,
      isDefault: true,
    });

    // Unknown ids report not-removed (no existence oracle).
    await request(app.getHttpServer())
      .delete(`${ADDRESSES_BASE}/${second.body.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200)
      .then((res) => expect(res.body).toEqual({ removed: false }));
  });

  it('rejects invalid payloads and isolates users', async () => {
    const customer = await createUserWithToken();
    const other = await createUserWithToken();

    await request(app.getHttpServer())
      .post(ADDRESSES_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ ...VALID_ADDRESS, phone: '0912', postalCode: '123' })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post(ADDRESSES_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send(VALID_ADDRESS)
      .expect(201);

    // Cross-user update/delete are non-disclosure 404 / not-removed.
    await request(app.getHttpServer())
      .patch(`${ADDRESSES_BASE}/${created.body.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ city: 'بابل' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`${ADDRESSES_BASE}/${created.body.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(200)
      .then((res) => expect(res.body).toEqual({ removed: false }));

    // The owner's row is untouched.
    await request(app.getHttpServer())
      .get(ADDRESSES_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200)
      .then((res) => expect(res.body.items).toHaveLength(1));
  });
});
