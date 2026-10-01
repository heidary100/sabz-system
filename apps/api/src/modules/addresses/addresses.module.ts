import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

/**
 * Customer address book (SS-233). Self-owned customer state behind
 * `JwtAuthGuard` (no roles), mirroring the cart/wishlist module shape.
 * Exported for the orders checkout flow (address lookup + snapshot).
 * SS-244A: imports AuditModule — address mutations are PII and audited.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
