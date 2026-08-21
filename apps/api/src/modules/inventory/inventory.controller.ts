import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AppRole } from '../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { InventoryService } from './inventory.service';
import {
  ListInventoryQueryDto,
  ListWarehouseInventoryQueryDto,
} from './dto';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/**
 * Admin inventory read endpoints (SS-112). Read-only: paginated overview,
 * per-variant stock across active warehouses, and per-warehouse stock.
 */
@ApiTags('admin-inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('inventory')
  @ApiOperation({
    summary:
      'Paginated inventory overview with variant/warehouse/stockStatus filters and SKU/name search',
  })
  @ApiResponse({ status: 200, description: 'Paginated inventory summaries.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: ListInventoryQueryDto) {
    return this.inventoryService.list(query);
  }

  @Get('inventory/variants/:variantId')
  @ApiOperation({
    summary: 'Return inventory for one variant across its active warehouses',
  })
  @ApiParam({ name: 'variantId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Inventory summaries returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Variant not found.' })
  async listByVariant(@Param('variantId', UUID_PARAM) variantId: string) {
    return this.inventoryService.listByVariant(variantId);
  }

  @Get('warehouses/:warehouseId/inventory')
  @ApiOperation({
    summary: 'Return inventory for one active warehouse with pagination',
  })
  @ApiParam({ name: 'warehouseId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Paginated inventory summaries.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Warehouse not found.' })
  async listByWarehouse(
    @Param('warehouseId', UUID_PARAM) warehouseId: string,
    @Query() query: ListWarehouseInventoryQueryDto,
  ) {
    return this.inventoryService.listByWarehouse(warehouseId, query);
  }
}
