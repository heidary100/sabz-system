import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BASE = '/api/v1';
const SYNTHETIC_NATIONAL_ID = '6059926746';
const SYNTHETIC_NATIONAL_ID_REPLACEMENT = '7291363357';
const INVALID_CHECKSUM_NATIONAL_ID = '6059926747';

describe('Personal National ID profile API (SS-260)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const userIds: string[] = [];
  const mobiles: string[] = [];
  const roleIds: Record<string, string> = {};

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
      throw new Error(`Unable to seed role ${name}`);
    }
  }

  async function createUser(
    mobile: string,
    options: {
      role?: 'CUSTOMER' | 'OPERATOR' | 'ADMIN';
      deleted?: boolean;
    } = {},
  ): Promise<{ userId: string; accessToken: string }> {
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: {
        mobile,
        status: UserStatus.ACTIVE,
        deletedAt: options.deleted ? new Date() : null,
        profile: {
          create: {
            firstName: 'علی',
            lastName: 'احمدی',
          },
        },
      },
    });
    userIds.push(user.id);

    if (options.role) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: roleIds[options.role]!,
          assignedBy: user.id,
        },
      });
    }

    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, accessToken: tokens.accessToken };
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
      where: {
        OR: [{ userId: { in: userIds } }, { entityId: { in: userIds } }],
      },
    });
    await prisma.userSession.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('rejects unauthenticated profile and admin routes with 401', async () => {
    await request(app.getHttpServer()).get(`${BASE}/auth/profile`).expect(401);
    await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .send({ nationalId: SYNTHETIC_NATIONAL_ID })
      .expect(401);
    await request(app.getHttpServer())
      .get(
        `${BASE}/admin/users/00000000-0000-0000-0000-000000000000/personal-national-id`,
      )
      .expect(401);
  });

  it('returns an unset safe state and rejects invalid values without writing', async () => {
    const customer = await createUser('+989142600001', { role: 'CUSTOMER' });

    const initial = await request(app.getHttpServer())
      .get(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(200);
    expect(initial.body.hasNationalId).toBe(false);
    expect(initial.body.maskedNationalId).toBeNull();
    expect(initial.headers['cache-control']).toBe('no-store');

    const invalid = await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ nationalId: INVALID_CHECKSUM_NATIONAL_ID })
      .expect(400);
    expect(invalid.body.message).toBe(
      'کد ملی واردشده معتبر نیست؛ رقم کنترل را بررسی کنید.',
    );
    expect(JSON.stringify(invalid.body)).not.toContain(
      INVALID_CHECKSUM_NATIONAL_ID,
    );

    await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ nationalId: '' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ nationalId: null })
      .expect(400);

    const leadingZero = await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ nationalId: '0013542419' })
      .expect(400);
    expect(leadingZero.body.message).toBe(
      'کد ملی نمی‌تواند با صفر شروع شود.',
    );

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: customer.userId },
      select: { nationalId: true },
    });
    expect(stored.nationalId).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'USER_NATIONAL_ID_UPDATED',
          entityId: customer.userId,
        },
      }),
    ).toBe(0);
  });

  it('stores Persian digits canonically and returns only the mask', async () => {
    const customer = await createUser('+989142600002', { role: 'CUSTOMER' });

    const updated = await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ nationalId: '۶۰۵۹۹۲۶۷۴۶' })
      .expect(200);

    expect(updated.body.hasNationalId).toBe(true);
    expect(updated.body.maskedNationalId).toBe('****6746');
    expect(JSON.stringify(updated.body)).not.toContain(
      SYNTHETIC_NATIONAL_ID,
    );
    expect(updated.headers['cache-control']).toBe('no-store');

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: customer.userId },
      select: { nationalId: true },
    });
    expect(stored.nationalId).toBe(SYNTHETIC_NATIONAL_ID);

    const read = await request(app.getHttpServer())
      .get(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(200);
    expect(read.body.hasNationalId).toBe(true);
    expect(read.body.maskedNationalId).toBe('****6746');
    expect(JSON.stringify(read.body)).not.toContain(SYNTHETIC_NATIONAL_ID);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: 'USER_NATIONAL_ID_UPDATED',
        entityId: customer.userId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.after).toEqual({ nationalIdChanged: true });
    expect(JSON.stringify(audit.before)).not.toContain(
      SYNTHETIC_NATIONAL_ID,
    );
    expect(JSON.stringify(audit.after)).not.toContain(
      SYNTHETIC_NATIONAL_ID,
    );
  });

  it('replaces a valid value and preserves it when a replacement is invalid', async () => {
    const customer = await createUser('+989142600003', { role: 'CUSTOMER' });

    await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ nationalId: SYNTHETIC_NATIONAL_ID })
      .expect(200);

    const replaced = await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ nationalId: SYNTHETIC_NATIONAL_ID_REPLACEMENT })
      .expect(200);
    expect(replaced.body.maskedNationalId).toBe('****3357');

    await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ nationalId: INVALID_CHECKSUM_NATIONAL_ID })
      .expect(400);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: customer.userId },
      select: { nationalId: true },
    });
    expect(stored.nationalId).toBe(SYNTHETIC_NATIONAL_ID_REPLACEMENT);

    const read = await request(app.getHttpServer())
      .get(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(200);
    expect(read.body.maskedNationalId).toBe('****3357');
  });

  it('preserves the national ID when only profile fields are updated', async () => {
    const customer = await createUser('+989142600004', { role: 'CUSTOMER' });

    await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ nationalId: SYNTHETIC_NATIONAL_ID })
      .expect(200);

    const updated = await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ firstName: 'نام جدید' })
      .expect(200);

    expect(updated.body.firstName).toBe('نام جدید');
    expect(updated.body.maskedNationalId).toBe('****6746');
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: customer.userId },
      select: { nationalId: true },
    });
    expect(stored.nationalId).toBe(SYNTHETIC_NATIONAL_ID);
  });

  it('isolates owners from each other', async () => {
    const first = await createUser('+989142600005', { role: 'CUSTOMER' });
    const second = await createUser('+989142600006', { role: 'CUSTOMER' });

    await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ nationalId: SYNTHETIC_NATIONAL_ID })
      .expect(200);

    const secondRead = await request(app.getHttpServer())
      .get(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200);
    expect(secondRead.body.hasNationalId).toBe(false);
    expect(secondRead.body.maskedNationalId).toBeNull();

    await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${second.accessToken}`)
      .send({ nationalId: SYNTHETIC_NATIONAL_ID_REPLACEMENT })
      .expect(200);

    const firstRead = await request(app.getHttpServer())
      .get(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200);
    expect(firstRead.body.maskedNationalId).toBe('****6746');
  });

  it('exposes only a masked ADMIN view and never the general user list/detail', async () => {
    const customer = await createUser('+989142600007', { role: 'CUSTOMER' });
    const admin = await createUser('+989142600008', { role: 'ADMIN' });
    const operator = await createUser('+989142600009', { role: 'OPERATOR' });

    await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ nationalId: SYNTHETIC_NATIONAL_ID })
      .expect(200);

    const masked = await request(app.getHttpServer())
      .get(`${BASE}/admin/users/${customer.userId}/personal-national-id`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(masked.body).toEqual({
      hasNationalId: true,
      maskedNationalId: '****6746',
    });
    expect(JSON.stringify(masked.body)).not.toContain(
      SYNTHETIC_NATIONAL_ID,
    );
    expect(masked.headers['cache-control']).toBe('no-store');

    await request(app.getHttpServer())
      .get(`${BASE}/admin/users/${customer.userId}/personal-national-id`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${BASE}/admin/users/${customer.userId}/personal-national-id`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(
        `${BASE}/admin/users/00000000-0000-0000-0000-000000000000/personal-national-id`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);

    const list = await request(app.getHttpServer())
      .get(`${BASE}/admin/users?search=142600007`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(JSON.stringify(list.body)).not.toContain(SYNTHETIC_NATIONAL_ID);
    const listed = list.body.items.find(
      (item: { id: string }) => item.id === customer.userId,
    );
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty('nationalId');

    const detail = await request(app.getHttpServer())
      .get(`${BASE}/admin/users/${customer.userId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(JSON.stringify(detail.body)).not.toContain(
      SYNTHETIC_NATIONAL_ID,
    );
    expect(detail.body).not.toHaveProperty('nationalId');

    const byValue = await request(app.getHttpServer())
      .get(`${BASE}/admin/users?search=${SYNTHETIC_NATIONAL_ID}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      byValue.body.items.some(
        (item: { id: string }) => item.id === customer.userId,
      ),
    ).toBe(false);
  });

  it('does not expose the value through /auth/me or public catalog responses', async () => {
    const customer = await createUser('+989142600010', { role: 'CUSTOMER' });

    await request(app.getHttpServer())
      .patch(`${BASE}/auth/profile`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ nationalId: SYNTHETIC_NATIONAL_ID })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get(`${BASE}/auth/me`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(200);
    expect(JSON.stringify(me.body)).not.toContain(SYNTHETIC_NATIONAL_ID);

    const catalog = await request(app.getHttpServer())
      .get(`${BASE}/catalog/products?limit=1`)
      .expect(200);
    expect(JSON.stringify(catalog.body)).not.toContain(
      SYNTHETIC_NATIONAL_ID,
    );
  });

  it('returns 404 for a soft-deleted user on the ADMIN masked route', async () => {
    const admin = await createUser('+989142600011', { role: 'ADMIN' });
    const deleted = await createUser('+989142600012', {
      role: 'CUSTOMER',
      deleted: true,
    });

    await request(app.getHttpServer())
      .get(`${BASE}/admin/users/${deleted.userId}/personal-national-id`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);
  });
});
