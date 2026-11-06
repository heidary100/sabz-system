import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AppRole } from '../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CatalogGridService } from './catalog-grid.service';
import {
  CatalogGridBatchDto,
  ListCatalogGridQueryDto,
} from './dto';

/**
 * SS-257 catalog grid: server-paginated variant rows for the admin inline
 * price/stock editor plus the explicit batch save. Backend authorization is
 * authoritative — the admin UI may hide controls, but never guards them.
 */
@ApiTags('admin-catalog-grid')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/catalog-grid')
export class CatalogGridController {
  constructor(private readonly catalogGridService: CatalogGridService) {}

  @Get()
  @ApiOperation({ summary: 'List catalog grid rows (server-side pagination + filters)' })
  async list(@Query() query: ListCatalogGridQueryDto) {
    return this.catalogGridService.list(query);
  }

  @Post('batch')
  // A batch save is an update sweep, not a resource creation: 200 even with
  // failed rows (per-row outcomes carry the 409/422 semantics).
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Batch inline updates (≤50 rows) for price/compareAt/priceStatus/stock with per-row outcomes',
  })
  async batch(
    @Body() dto: CatalogGridBatchDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.catalogGridService.batch(dto, user.userId, ipAddress);
  }
}
