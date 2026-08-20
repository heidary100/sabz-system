import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';

/**
 * Inventory-domain module (EPIC-006). SS-111 owns warehouse management only:
 * paginated reads, create/update and the activate/deactivate lifecycle with
 * transactional audit. Warehouse management is independent of the runtime
 * inventory (stock/receive/adjust/reservation/movement) logic owned by
 * SS-112 onward; this module does not import the products domain.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [WarehousesController],
  providers: [WarehousesService],
})
export class InventoryModule {}