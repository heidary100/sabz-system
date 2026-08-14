import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

jest.setTimeout(30_000);

async function createApp(options?: { throttlerLimit?: number }): Promise<INestApplication> {
  let moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (options?.throttlerLimit) {
    moduleBuilder = moduleBuilder.overrideProvider(getOptionsToken()).useValue({
      throttlers: [{ ttl: 60_000, limit: options.throttlerLimit }],
    });
  }

  const moduleFixture: TestingModule = await moduleBuilder.compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('Security middleware (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves standard security headers on API responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['strict-transport-security']).toMatch(/^max-age=/);
    expect(response.headers['x-dns-prefetch-control']).toBe('off');
    expect(response.headers['referrer-policy']).toBeDefined();
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('includes a content-security-policy that blocks inline scripts', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    const csp = response.headers['content-security-policy'] as string;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it('exposes rate limit headers on responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(Number(response.headers['x-ratelimit-limit'])).toBeGreaterThan(0);
    expect(Number(response.headers['x-ratelimit-remaining'])).toBeGreaterThanOrEqual(
      0,
    );
  });

  it('serves the Swagger UI and OpenAPI JSON in non-production environments', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);

    const json = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(json.body).toMatchObject({
      openapi: expect.stringMatching(/^3\./),
      info: { title: 'Sabz System API' },
    });
  });
});

describe('Security middleware rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp({ throttlerLimit: 3 });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns HTTP 429 once the per-route limit is exceeded', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    }

    const blocked = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(429);

    expect(blocked.headers['retry-after']).toBeDefined();
  });
});

describe('Security middleware rate limiting from environment (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '2';
    process.env.THROTTLE_TTL_MS = '500';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.THROTTLE_LIMIT;
    delete process.env.THROTTLE_TTL_MS;
  });

  it('reads numeric limits from environment variables and lets blocks expire', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    const blocked = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 700));

    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });
});

describe('Security middleware trust proxy (e2e)', () => {
  it('applies the TRUST_PROXY setting to the underlying express app', async () => {
    process.env.TRUST_PROXY = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const expressApp = app.getHttpAdapter().getInstance();
    expect(expressApp.get('trust proxy')).toBe(true);

    await app.close();
    delete process.env.TRUST_PROXY;
  });
});
