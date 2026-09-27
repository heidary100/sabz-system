import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PricingModule } from '../pricing/pricing.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { OrdersController } from './orders.controller';

/**
 * Customer checkout + orders (SS-233). Self-owned customer state behind
 * `JwtAuthGuard` (no roles), mirroring the cart/wishlist module shape.
 * Stock truth comes from `InventoryService` (reserve → consume → restock);
 * price truth comes from `PricingService` (SS-235, resolved per line);
 * address ownership re-checks go through Prisma directly (the address book
 * read needs no address-module logic). No product-domain dependency: line
 * truth is read from the same Prisma rows the catalog projects.
 */
@Module({
  imports: [AuthModule, InventoryModule, PricingModule],
  controllers: [CheckoutController, OrdersController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class OrdersModule {}
