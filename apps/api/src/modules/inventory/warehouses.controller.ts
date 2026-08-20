import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { WarehousesService } from './warehouses.service';
import {
  CreateWarehouseDto,
  ListWarehousesQueryDto,
  UpdateWarehouseDto,
} from './dto';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('admin-warehouses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN)
@Controller('admin/warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @ApiOperation({ summary: 'List warehouses with pagination' })
  @ApiResponse({ status: 200, description: 'Paginated warehouse summaries.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: ListWarehousesQueryDto) {
    return this.warehousesService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Return a single warehouse detail' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Warehouse detail returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Warehouse not found.' })
  async getDetail(@Param('id', UUID_PARAM) warehouseId: string) {
    return this.warehousesService.getDetail(warehouseId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a warehouse' })
  @ApiResponse({ status: 201, description: 'Warehouse created.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 409, description: 'Duplicate code.' })
  async create(
    @Body() dto: CreateWarehouseDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.warehousesService.create(dto, user.userId, ipAddress);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a warehouse' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Warehouse updated.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Warehouse not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate code.' })
  async update(
    @Param('id', UUID_PARAM) warehouseId: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.warehousesService.update(warehouseId, dto, user.userId, ipAddress);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Deactivate an ACTIVE warehouse (last active warehouse cannot be deactivated)',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Warehouse deactivated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Warehouse not found.' })
  @ApiResponse({ status: 409, description: 'State conflict or last active warehouse.' })
  async deactivate(
    @Param('id', UUID_PARAM) warehouseId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.warehousesService.deactivate(warehouseId, user.userId, ipAddress);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate an INACTIVE warehouse' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Warehouse activated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Warehouse not found.' })
  @ApiResponse({ status: 409, description: 'State conflict.' })
  async activate(
    @Param('id', UUID_PARAM) warehouseId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.warehousesService.activate(warehouseId, user.userId, ipAddress);
  }
}