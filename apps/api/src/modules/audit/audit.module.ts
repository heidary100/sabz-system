import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * Audit-domain module. Writes audit events through AuditService (consumed by
 * every domain) and, since SS-064, owns the read-only admin audit query
 * controller. The AuthModule import is forwardRef'd because AuthModule in
 * turn imports AuditModule for its audit writes; the guard providers used by
 * AuditController resolve through that cycle.
 */
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
