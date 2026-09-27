import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { OrdersController } from './orders.controller';

/**
 * Customer checkout + orders (SS-233). Self-owned customer state behind
 * `JwtAuthGuard` (no roles), mirroring the cart/wishlist module shape.
 * Stock truth comes from `InventoryService` (reserve → consume → restock);
 * address ownership re-checks go through Prisma directly (the address book
 * read needs no address-module logic). No product-domain dependency: line
 * truth is read from the same Prisma rows the catalog projects.
 */
@Module({
  imports: [AuthModule, InventoryModule],
  controllers: [CheckoutController, OrdersController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class OrdersModule {}
