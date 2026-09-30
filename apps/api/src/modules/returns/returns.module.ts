import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AdminReturnsController } from './admin-returns.controller';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';

/**
 * Returns workflow (SS-242). Filing is self-scoped customer state behind
 * `JwtAuthGuard`; the operator queue is OPERATOR/ADMIN behind
 * `RolesGuard`. Audit events flow through `AuditService`. No reverse
 * dependencies, hence no module cycle.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [AdminReturnsController, ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
