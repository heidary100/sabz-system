import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PricingModule } from '../pricing/pricing.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

/**
 * Customer shopping cart (SS-232). Listing truth is read from the same
 * Prisma rows the catalog projects and stock reuses the shared SS-112
 * aggregate helpers, so no product-domain service dependency is needed —
 * only `AuthModule` (for `JwtAuthGuard`), mirroring the wishlist shape
 * without its hydration coupling. Line prices resolve through
 * `PricingModule` (SS-235: tier → bulk → promotion, server-side).
 */
@Module({
  imports: [AuthModule, PricingModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
