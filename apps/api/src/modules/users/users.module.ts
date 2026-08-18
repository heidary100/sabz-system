import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * User-domain module. Owns the operator/admin user read API (SS-061) and the
 * account lifecycle API (SS-062: suspend/unsuspend/unlock). Lifecycle
 * mutations write audit events through the shared AuditService.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}