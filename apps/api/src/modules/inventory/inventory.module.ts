import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';

/**
 * Inventory-domain module (EPIC-006). SS-111 owns warehouse management:
 * paginated reads, create/update and the activate/deactivate lifecycle with
 * transactional audit. SS-112 adds the read-only inventory API (overview,
 * per-variant and per-warehouse stock) with derived availability/stock status,
 * plus the aggregate helper boundary reused by the SS-113 mutation API. SS-113
 * adds the receive/adjust mutation API and the SS-104 compatibility write path,
 * all through InventoryService. This module does not import the products
 * domain; cross-domain existence checks go through Prisma directly.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [WarehousesController, InventoryController],
  providers: [WarehousesService, InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}