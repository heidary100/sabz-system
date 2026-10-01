import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { RfqController } from './rfq.controller';
import { RfqService } from './rfq.service';

/**
 * Request-for-quotation workflow (SS-235 B2). Customer RFQ state behind
 * `JwtAuthGuard` (partner-gated create, self-scoped reads, owner accept);
 * operator quoting behind OPERATOR/ADMIN roles. Order conversion reuses
 * `CheckoutService.placeQuotedOrder` (exported by `OrdersModule`) so the
 * quoted price freezes through the single order-creation path; audit
 * events flow through `AuditService`. No reverse dependencies, hence no
 * module cycle.
 */
@Module({
  imports: [AuthModule, OrdersModule, AuditModule, NotificationsModule],
  controllers: [RfqController],
  providers: [RfqService],
})
export class RfqModule {}
