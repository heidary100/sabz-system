import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AdminRolesController } from './admin-roles.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * User-domain module. Owns the operator/admin user read API (SS-061), the
 * account lifecycle API (SS-062: suspend/unsuspend/unlock) and the role
 * administration API (SS-063: assign/remove roles, role catalog). Mutations
 * write audit events through the shared AuditService.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [UsersController, AdminRolesController],
  providers: [UsersService],
})
export class UsersModule {}