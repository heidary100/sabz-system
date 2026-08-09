import { Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  service: string;
  redis: 'ok' | 'error';
  timestamp: string;
}

const REDIS_PING_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  constructor(private readonly redisService: RedisService) {}

  async check(): Promise<HealthCheckResult> {
    const redisHealthy = await this.checkRedis();

    return {
      status: redisHealthy ? 'ok' : 'error',
      service: 'sabz-api',
      redis: redisHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkRedis(): Promise<boolean> {
    const ping = this.redisService.ping().then(
      () => true,
      () => false,
    );
    const timeout = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), REDIS_PING_TIMEOUT_MS);
      timer.unref();
    });

    return Promise.race([ping, timeout]);
  }
}
