import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

/**
 * Customer address book (SS-233). Self-owned customer state behind
 * `JwtAuthGuard` (no roles), mirroring the cart/wishlist module shape.
 * Exported for the orders checkout flow (address lookup + snapshot).
 */
@Module({
  imports: [AuthModule],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
