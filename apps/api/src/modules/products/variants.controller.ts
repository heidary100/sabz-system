import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { VariantsService } from './variants.service';
import {
  CreateVariantDto,
  UpdateVariantDto,
  UpdateVariantInventoryDto,
} from './dto';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/**
 * Variant endpoints nested under a product (list + create). The owning product
 * id is taken from the route param and never from the client body.
 */
@ApiTags('admin-products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/products')
export class ProductVariantsController {
  constructor(private readonly variantsService: VariantsService) {}

  @Get(':productId/variants')
  @ApiOperation({ summary: 'List active variants of a product' })
  @ApiParam({ name: 'productId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Variant summaries returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  async list(@Param('productId', UUID_PARAM) productId: string) {
    return this.variantsService.list(productId);
  }

  @Post(':productId/variants')
  @ApiOperation({ summary: 'Create a variant for a product' })
  @ApiParam({ name: 'productId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Variant created.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate SKU or archived product.' })
  async create(
    @Param('productId', UUID_PARAM) productId: string,
    @Body() dto: CreateVariantDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.variantsService.create(productId, dto, user.userId, ipAddress);
  }
}

/**
 * Variant-level endpoints (detail/update/delete/inventory) keyed by variant id.
 */
@ApiTags('admin-variants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/variants')
export class AdminVariantsController {
  constructor(private readonly variantsService: VariantsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Return a single variant' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Variant detail returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Variant not found.' })
  async getDetail(@Param('id', UUID_PARAM) variantId: string) {
    return this.variantsService.getDetail(variantId);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update variant business fields (sku, barcode, name, price). Not inventory.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Variant updated.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Variant not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate SKU or archived product.' })
  async update(
    @Param('id', UUID_PARAM) variantId: string,
    @Body() dto: UpdateVariantDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.variantsService.update(variantId, dto, user.userId, ipAddress);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a variant' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Variant soft-deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Variant not found.' })
  async softDelete(
    @Param('id', UUID_PARAM) variantId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.variantsService.softDelete(variantId, user.userId, ipAddress);
  }

  @Patch(':id/inventory')
  @ApiOperation({
    summary:
      'DEPRECATED (SS-113). Set the absolute stockQuantity on the default warehouse through the inventory write path.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Stock quantity set.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Variant not found.' })
  @ApiResponse({ status: 409, description: 'Archived product.' })
  async updateInventory(
    @Param('id', UUID_PARAM) variantId: string,
    @Body() dto: UpdateVariantInventoryDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.variantsService.updateInventory(
      variantId,
      dto,
      user.userId,
      ipAddress,
    );
  }
}
