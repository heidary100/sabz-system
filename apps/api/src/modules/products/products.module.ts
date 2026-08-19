import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

/**
 * Product-domain module (SS-102). Owns the operator/admin product
 * administration API: create, list, detail, update, publish, archive and
 * soft-delete. Mutations write audit events through the shared AuditService.
 * Variants (SS-104) and media (SS-105) are read-only here.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
