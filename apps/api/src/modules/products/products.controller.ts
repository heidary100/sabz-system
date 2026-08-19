import {
  Body,
  Controller,
  Delete,
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
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './dto';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('admin-products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: 'List/search/filter products with pagination',
  })
  @ApiResponse({ status: 200, description: 'Paginated product summaries.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: ListProductsQueryDto) {
    return this.productsService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Return a single product detail' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Product detail returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  async getDetail(@Param('id', UUID_PARAM) productId: string) {
    return this.productsService.getDetail(productId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a product (always starts as DRAFT)',
  })
  @ApiResponse({ status: 201, description: 'Product created.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Brand or category not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate slug.' })
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.productsService.create(dto, user.userId, ipAddress);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update product business fields. Status is changed only via publish/archive.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Product updated.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate slug or archived product.' })
  async update(
    @Param('id', UUID_PARAM) productId: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.productsService.update(productId, dto, user.userId, ipAddress);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an ARCHIVED product' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Product soft-deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @ApiResponse({ status: 409, description: 'Product is not archived.' })
  async softDelete(
    @Param('id', UUID_PARAM) productId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.productsService.softDelete(productId, user.userId, ipAddress);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a DRAFT product (requires a variant)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Product published.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @ApiResponse({ status: 409, description: 'State conflict or missing variant.' })
  async publish(
    @Param('id', UUID_PARAM) productId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.productsService.publish(productId, user.userId, ipAddress);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a PUBLISHED product' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Product archived.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @ApiResponse({ status: 409, description: 'State conflict.' })
  async archive(
    @Param('id', UUID_PARAM) productId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.productsService.archive(productId, user.userId, ipAddress);
  }
}
