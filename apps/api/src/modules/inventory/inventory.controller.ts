import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { InventoryService } from './inventory.service';
import {
  AdjustInventoryDto,
  ListInventoryQueryDto,
  ListMovementsQueryDto,
  ListReservationsQueryDto,
  ListWarehouseInventoryQueryDto,
  ReceiveStockDto,
  ReserveInventoryDto,
} from './dto';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/**
 * Admin inventory endpoints. SS-112 owns the read-only routes (overview,
 * per-variant stock across active warehouses, and per-warehouse stock); SS-113
 * adds the receive and absolute-adjust mutation routes; SS-114 adds the
 * read-only movement-history route over the immutable ledger; SS-115 adds the
 * reservation routes (reserve, release, consume, list). Controllers are thin:
 * all transaction and business logic lives in InventoryService.
 */
@ApiTags('admin-inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('inventory/receive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Receive stock into a warehouse; creates the InventoryItem on first receipt (INITIAL_STOCK) and increments it on later receipts (PURCHASE_RECEIPT)',
  })
  @ApiResponse({ status: 200, description: 'InventoryItemSummary after receipt.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Variant, product or warehouse not found.' })
  @ApiResponse({ status: 409, description: 'Archived product or inactive warehouse.' })
  async receive(
    @Body() dto: ReceiveStockDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.inventoryService.receive(dto, user.userId, ipAddress);
  }

  @Post('inventory/adjust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Absolute inventory adjustment with a mandatory reason; quantity is the desired quantityOnHand, not a delta',
  })
  @ApiResponse({ status: 200, description: 'InventoryItemSummary after adjustment.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Variant, product, warehouse or item not found.' })
  @ApiResponse({ status: 409, description: 'Archived product, inactive warehouse or stale concurrent adjust.' })
  async adjust(
    @Body() dto: AdjustInventoryDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.inventoryService.adjust(dto, user.userId, ipAddress);
  }

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

  @Get('inventory/movements')
  @ApiOperation({
    summary:
      'Paginated read-only view of the immutable inventory-movement ledger with variant/warehouse/type/date filters',
  })
  @ApiResponse({ status: 200, description: 'Paginated movement summaries.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async listMovements(@Query() query: ListMovementsQueryDto) {
    return this.inventoryService.listMovements(query);
  }

  @Post('inventory/reserve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reserve stock against an existing InventoryItem; only succeeds while available = quantityOnHand - quantityReserved covers the quantity',
  })
  @ApiResponse({ status: 200, description: 'ReservationSummary of the created reservation.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Variant, product, warehouse or item not found.' })
  @ApiResponse({ status: 409, description: 'Archived product, inactive warehouse or insufficient availability.' })
  async reserve(
    @Body() dto: ReserveInventoryDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.inventoryService.reserve(dto, user.userId, ipAddress);
  }

  @Post('inventory/reservations/:id/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Release an ACTIVE reservation; decrements quantityReserved and restores availability',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'ReservationSummary after release.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Reservation not found.' })
  @ApiResponse({ status: 409, description: 'Reservation is not ACTIVE or a concurrent transition won.' })
  async releaseReservation(
    @Param('id', UUID_PARAM) id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.inventoryService.releaseReservation(id, user.userId, ipAddress);
  }

  @Post('inventory/reservations/:id/consume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Consume an ACTIVE reservation; decrements quantityReserved and quantityOnHand and refreshes the variant aggregate',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'ReservationSummary after consumption.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Reservation not found.' })
  @ApiResponse({ status: 409, description: 'Reservation is not ACTIVE, insufficient on-hand or a concurrent transition won.' })
  async consumeReservation(
    @Param('id', UUID_PARAM) id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.inventoryService.consumeReservation(id, user.userId, ipAddress);
  }

  @Get('inventory/reservations')
  @ApiOperation({
    summary:
      'Paginated reservation list with status/variant/warehouse filters and deterministic ordering; read-only, never expires rows',
  })
  @ApiResponse({ status: 200, description: 'Paginated reservation summaries.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async listReservations(@Query() query: ListReservationsQueryDto) {
    return this.inventoryService.listReservations(query);
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

  @Get('inventory/warehouses')
  @ApiOperation({
    summary:
      'Return active warehouses as inventory filter options (read-only; the SS-111 warehouse list stays ADMIN-only)',
  })
  @ApiResponse({ status: 200, description: 'Active warehouse summaries.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async listWarehouseOptions() {
    return this.inventoryService.listWarehouseOptions();
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
