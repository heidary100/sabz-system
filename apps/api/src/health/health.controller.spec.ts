import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../common/redis/redis.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: RedisService,
          useValue: { ping: jest.fn().mockResolvedValue('PONG') },
        },
        HealthService,
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return an ok health status', async () => {
    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.redis).toBe('ok');
    expect(result.service).toBe('sabz-api');
  });
});
