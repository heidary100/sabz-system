import { RedisService } from '../common/redis/redis.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let redisService: { ping: jest.Mock };

  beforeEach(() => {
    redisService = { ping: jest.fn().mockResolvedValue('PONG') };
    service = new HealthService(redisService as unknown as RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return an ok health status when redis is reachable', async () => {
    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.redis).toBe('ok');
    expect(result.service).toBe('sabz-api');
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it('should return an error status when redis is unreachable', async () => {
    redisService.ping.mockRejectedValue(new Error('connection refused'));

    const result = await service.check();

    expect(result.status).toBe('error');
    expect(result.redis).toBe('error');
    expect(result.service).toBe('sabz-api');
  });
});
