import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    const password = configService.get<string>('REDIS_PASSWORD');

    super({
      lazyConnect: true,
      host: configService.get<string>('REDIS_HOST', 'localhost'),
      port: Number(configService.get('REDIS_PORT', 6379)),
      password: password || undefined,
    });
  }

  onModuleDestroy(): void {
    this.disconnect();
  }
}
