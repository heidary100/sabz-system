import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { StorefrontCacheModule } from '../../common/storefront-cache/storefront-cache.module';
import { AdminPricingController } from './admin-pricing.controller';
import { AdminPricingService } from './admin-pricing.service';
import { BulkPricingController } from './bulk-pricing.controller';
import { BulkPricingService } from './bulk-pricing.service';
import { PricingService } from './pricing.service';

/**
 * Server-side pricing engine (SS-235) plus operator CRUD (SS-240B) and the
 * bulk pricing workspace (pricing-grid spec). Imported by the cart and
 * order modules (the only price-apply points).
 */
@Module({
  imports: [AuthModule, AuditModule, StorefrontCacheModule],
  controllers: [AdminPricingController, BulkPricingController],
  providers: [PricingService, AdminPricingService, BulkPricingService],
  exports: [PricingService, AdminPricingService, BulkPricingService],
})
export class PricingModule {}
