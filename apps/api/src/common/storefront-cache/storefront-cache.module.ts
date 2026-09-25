import { Global, Module } from '@nestjs/common';
import { StorefrontCacheService } from './storefront-cache.service';

/**
 * Global so every catalog-owning module (products, inventory, import) can
 * invalidate storefront cache reads after committed mutations (SS-217).
 */
@Global()
@Module({
  providers: [StorefrontCacheService],
  exports: [StorefrontCacheService],
})
export class StorefrontCacheModule {}
