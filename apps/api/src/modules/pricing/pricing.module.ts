import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';

/**
 * Server-side pricing engine (SS-235). Pure price math plus tier and
 * scheduled-promotion lookups; imported by the cart and orders modules
 * (the only price-apply points). No controller in Round A — admin
 * pricing CRUD arrives with SS-240.
 */
@Module({
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
