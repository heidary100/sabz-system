import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/database/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PartnersModule } from './modules/partners/partners.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const ttl = Number(configService.get('THROTTLE_TTL_MS', 60_000));
        const limit = Number(configService.get('THROTTLE_LIMIT', 100));

        return {
          throttlers: [
            {
              ttl: Number.isFinite(ttl) && ttl > 0 ? ttl : 60_000,
              limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
            },
          ],
        };
      },
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    DashboardModule,
    PartnersModule,
    UsersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
