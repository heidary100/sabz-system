import { randomInt } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { RedisService } from '../src/common/redis/redis.service';
import { REFRESH_TOKEN_COOKIE } from '../src/modules/auth/refresh-token-cookie';
import { normalizeMobile } from '../src/modules/auth/utils/mobile.util';

jest.setTimeout(60_000);

const BASE = '/api/v1/auth';

interface HttpResponse {
  headers: Record<string, string | string[] | undefined>;
}

function uniqueMobile(): string {
  return `+989${randomInt(0, 1_000_000_000).toString().padStart(9, '0')}`;
}

function setCookies(response: HttpResponse): string[] {
  const raw = response.headers['set-cookie'];
  if (!raw) {
    return [];
  }
  return Array.isArray(raw) ? raw : [raw];
}

function refreshCookie(response: HttpResponse): string {
  const cookie = setCookies(response).find((value) =>
    value.startsWith(`${REFRESH_TOKEN_COOKIE}=`),
  );
  if (!cookie) {
    throw new Error('refresh cookie was not set');
  }
  return cookie;
}

function cookieValue(cookie: string): string {
  return cookie.split(';', 1)[0] ?? '';
}

function decodeSessionId(accessToken: string): string {
  const payload = JSON.parse(
    Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
  ) as { sessionId?: string };
  if (!payload.sessionId) {
    throw new Error('sessionId missing from access token');
  }
  return payload.sessionId;
}

/**
 * HTTP-level auth contract (SS-290).
 *
 * The refresh cookie is host-only and shared by every application that talks
 * to the same API origin. These tests pin the server-side cookie contract so
 * a future change cannot silently alter the name, path, flags, rotation, or
 * logout clearing. They do NOT prove browser cookie-jar isolation: that is a
 * deployment/browser property and is covered by the verification procedure in
 * docs/07-development/ss-290-cookie-isolation-verification.md.
 */
describe('Auth API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const originalCorsOrigins = process.env.CORS_ORIGINS;

  beforeAll(async () => {
    // Pin the CORS allow-list so the credentialed preflight assertion does
    // not depend on a developer's local .env.
    process.env.CORS_ORIGINS =
      'http://localhost:5173,http://localhost:3002';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    // OTP state lives in Redis and is not isolated by the test-database
    // setup. Use unique mobiles below, but reset the per-IP request/failure
    // windows so the suite is rerunnable without waiting a minute.
    const ipKeys = [
      ...(await redis.keys('auth:otp:rate:ip:*')),
      ...(await redis.keys('auth:otp:fail:ip:*')),
    ];
    if (ipKeys.length > 0) {
      await redis.del(...ipKeys);
    }
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.userSession.deleteMany({
        where: { user: { mobile: { in: mobiles } } },
      });
      await prisma.userRole.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    }

    // Remove only the OTP keys created by this suite.
    const otpKeys = mobiles.flatMap((mobile) => [
      `auth:otp:${mobile}`,
      `auth:otp:attempts:${mobile}`,
      `auth:otp:fail:${mobile}`,
      `auth:otp:rate:${mobile}`,
    ]);
    if (otpKeys.length > 0) {
      await redis.del(...otpKeys);
    }

    await app.close();

    if (originalCorsOrigins === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = originalCorsOrigins;
    }
  });

  async function requestCode(mobile: string): Promise<string> {
    await request(app.getHttpServer())
      .post(`${BASE}/request-otp`)
      .send({ mobile })
      .expect(200);

    const canonical = normalizeMobile(mobile);
    const code = await redis.get(`auth:otp:${canonical}`);
    if (!code) {
      throw new Error(`OTP code not found in Redis for ${canonical}`);
    }
    return code;
  }

  function track(mobile: string): void {
    const canonical = normalizeMobile(mobile);
    if (!mobiles.includes(canonical)) {
      mobiles.push(canonical);
    }
  }

  async function login(mobile: string) {
    track(mobile);
    const code = await requestCode(mobile);
    const response = await request(app.getHttpServer())
      .post(`${BASE}/verify-otp`)
      .send({ mobile, code })
      .expect(200);

    userIds.push(response.body.user.id as string);
    return response;
  }

  async function loginWithAgent(mobile: string) {
    track(mobile);
    const agent = request.agent(app.getHttpServer());
    const code = await requestCode(mobile);
    const response = await agent
      .post(`${BASE}/verify-otp`)
      .send({ mobile, code })
      .expect(200);

    userIds.push(response.body.user.id as string);
    return { agent, response };
  }

  it('sets the host-only refresh cookie on verify-otp and stores only its hash', async () => {
    const response = await login(uniqueMobile());
    const cookie = refreshCookie(response);

    expect(cookie).toContain(`${REFRESH_TOKEN_COOKIE}=`);
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Domain=');
    expect(cookie.includes('; Secure')).toBe(
      process.env.NODE_ENV === 'production',
    );

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));

    const session = await prisma.userSession.findFirst({
      where: { userId: response.body.user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(session).not.toBeNull();
    expect(session?.refreshToken).toMatch(/^[a-f0-9]{64}$/);
    expect(session?.refreshToken).not.toBe(response.body.refreshToken);
  });

  it('rotates the refresh token and rejects the previous token', async () => {
    const { agent, response } = await loginWithAgent(uniqueMobile());
    const originalRefresh = response.body.refreshToken as string;
    const originalCookie = cookieValue(refreshCookie(response));

    const refreshed = await agent.post(`${BASE}/refresh`).send({}).expect(200);
    const rotatedCookie = refreshCookie(refreshed);

    expect(cookieValue(rotatedCookie)).not.toBe(originalCookie);
    expect(refreshed.body.refreshToken).not.toBe(originalRefresh);

    await request(app.getHttpServer())
      .post(`${BASE}/refresh`)
      .send({ refreshToken: originalRefresh })
      .expect(401);

    await agent.post(`${BASE}/refresh`).send({}).expect(200);
  });

  it('accepts the refresh token in the body for non-browser clients', async () => {
    const response = await login(uniqueMobile());

    const refreshed = await request(app.getHttpServer())
      .post(`${BASE}/refresh`)
      .send({ refreshToken: response.body.refreshToken })
      .expect(200);

    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.refreshToken).not.toBe(response.body.refreshToken);
  });

  it('revokes the session and clears the cookie on logout', async () => {
    const { agent, response } = await loginWithAgent(uniqueMobile());
    const accessToken = response.body.accessToken as string;
    const refreshToken = response.body.refreshToken as string;
    const sessionId = decodeSessionId(accessToken);

    const logout = await agent
      .post(`${BASE}/logout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const cleared = refreshCookie(logout);

    expect(cleared).toContain(`${REFRESH_TOKEN_COOKIE}=;`);
    expect(cleared).toContain('Path=/api/v1/auth');
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);

    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
    });
    expect(session?.revokedAt).not.toBeNull();

    await agent.post(`${BASE}/refresh`).send({}).expect(401);
    await request(app.getHttpServer())
      .post(`${BASE}/refresh`)
      .send({ refreshToken })
      .expect(401);
  });

  it('rejects missing and invalid refresh tokens', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/refresh`)
      .send({})
      .expect(401);

    await request(app.getHttpServer())
      .post(`${BASE}/refresh`)
      .send({ refreshToken: 'invalid.token.value' })
      .expect(401);
  });

  it('requires a bearer token and resolves roles from the database', async () => {
    await request(app.getHttpServer()).get(`${BASE}/me`).expect(401);

    const response = await login(uniqueMobile());
    const userId = response.body.user.id as string;
    const token = response.body.accessToken as string;

    const customer = await request(app.getHttpServer())
      .get(`${BASE}/me`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(customer.body.roles).toEqual([]);

    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    const adminRole = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN' },
    });
    await prisma.userRole.create({
      data: { userId, roleId: adminRole.id, assignedBy: userId },
    });

    const admin = await request(app.getHttpServer())
      .get(`${BASE}/me`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(admin.body.roles).toContain('ADMIN');

    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('allows credentialed CORS only from configured origins', async () => {
    const allowed = await request(app.getHttpServer())
      .options(`${BASE}/refresh`)
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app.getHttpServer())
      .options(`${BASE}/refresh`)
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('permits only one of two concurrent refreshes with the same token', async () => {
    const response = await login(uniqueMobile());
    const refreshToken = response.body.refreshToken as string;

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`${BASE}/refresh`)
        .send({ refreshToken }),
      request(app.getHttpServer())
        .post(`${BASE}/refresh`)
        .send({ refreshToken }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 401]);
  });

  it('keeps two independent sessions refreshable (server contract only)', async () => {
    const first = await loginWithAgent(uniqueMobile());
    const second = await loginWithAgent(uniqueMobile());

    await first.agent.post(`${BASE}/refresh`).send({}).expect(200);
    await second.agent.post(`${BASE}/refresh`).send({}).expect(200);
  });
});
