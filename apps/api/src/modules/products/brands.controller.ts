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
import { BrandsService } from './brands.service';
import {
  CreateBrandDto,
  ListBrandsQueryDto,
  UpdateBrandDto,
} from './dto';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('admin-brands')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  @ApiOperation({ summary: 'List brands with pagination' })
  @ApiResponse({ status: 200, description: 'Paginated brand summaries.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: ListBrandsQueryDto) {
    return this.brandsService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Return a single brand detail' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Brand detail returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Brand not found.' })
  async getDetail(@Param('id', UUID_PARAM) brandId: string) {
    return this.brandsService.getDetail(brandId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a brand' })
  @ApiResponse({ status: 201, description: 'Brand created.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 409, description: 'Duplicate slug.' })
  async create(
    @Body() dto: CreateBrandDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.brandsService.create(dto, user.userId, ipAddress);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a brand' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Brand updated.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Brand not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate slug.' })
  async update(
    @Param('id', UUID_PARAM) brandId: string,
    @Body() dto: UpdateBrandDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.brandsService.update(brandId, dto, user.userId, ipAddress);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Soft-delete a brand with no active product references',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Brand soft-deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Brand not found.' })
  @ApiResponse({ status: 409, description: 'Brand has active product references.' })
  async softDelete(
    @Param('id', UUID_PARAM) brandId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.brandsService.softDelete(brandId, user.userId, ipAddress);
  }
}
