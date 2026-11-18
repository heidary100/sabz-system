import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/database/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { RedisService } from './common/redis/redis.service';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { StorefrontCacheModule } from './common/storefront-cache/storefront-cache.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { BlogModule } from './modules/blog/blog.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { CartModule } from './modules/cart/cart.module';
import { ChatModule } from './modules/chat/chat.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MerchandisingModule } from './modules/merchandising/merchandising.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PartnersModule } from './modules/partners/partners.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProductsModule } from './modules/products/products.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { RfqModule } from './modules/rfq/rfq.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TorobModule } from './modules/torob/torob.module';
import { UsersModule } from './modules/users/users.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, RedisService],
      useFactory: (configService: ConfigService, redis: RedisService) => {
        const ttl = Number(configService.get('THROTTLE_TTL_MS', 60_000));
        const limit = Number(configService.get('THROTTLE_LIMIT', 100));

        return {
          throttlers: [
            {
              ttl: Number.isFinite(ttl) && ttl > 0 ? ttl : 60_000,
              limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
            },
          ],
          // Redis-backed counters so limits hold across API replicas
          // (SS-244B); fail-open on Redis outage, never fail the request.
          storage: new RedisThrottlerStorage(redis),
        };
      },
    }),
    PrismaModule,
    RedisModule,
    StorefrontCacheModule,
    HealthModule,
    AuthModule,
    AddressesModule,
    BlogModule,
    CartModule,
    ChatModule,
    DashboardModule,
    CurrencyModule,
    InventoryModule,
    MerchandisingModule,
    NotificationsModule,
    OrdersModule,
    PartnersModule,
    PaymentsModule,
    ProductsModule,
    RealtimeModule,
    ReviewsModule,
    ReturnsModule,
    RfqModule,
    SettingsModule,
    TorobModule,
    UsersModule,
    WishlistModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
