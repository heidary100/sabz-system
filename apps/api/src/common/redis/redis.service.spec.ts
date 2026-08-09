import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  const configService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const values: Record<string, unknown> = {
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: '',
      };

      return values[key] ?? defaultValue;
    }),
  } as unknown as ConfigService;

  afterEach(() => {
    service?.disconnect();
  });

  let service: RedisService;

  it('should be defined', () => {
    service = new RedisService(configService);

    expect(service).toBeDefined();
  });

  it('should expose a redis client with ping capability', () => {
    service = new RedisService(configService);

    expect(typeof service.ping).toBe('function');
    expect(typeof service.disconnect).toBe('function');
  });
});
