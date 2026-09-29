import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AdminPricingController } from './admin-pricing.controller';
import { AdminPricingService } from './admin-pricing.service';
import { PricingService } from './pricing.service';

/**
 * Server-side pricing engine (SS-235). Pure price math plus tier and
 * scheduled-promotion lookups; imported by the cart and orders modules
 * (the only price-apply points). Operator CRUD for the pricing models
 * lives in `AdminPricingController`/`AdminPricingService` (SS-240B);
 * the engine (`PricingService.resolveLine`) stays untouched.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [AdminPricingController],
  providers: [PricingService, AdminPricingService],
  exports: [PricingService, AdminPricingService],
})
export class PricingModule {}
