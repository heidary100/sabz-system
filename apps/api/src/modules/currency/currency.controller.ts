import {
  Body,
  Controller,
  Get,
  Ip,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AppRole } from '../auth/enums/app-role.enum';
import { CurrencyService } from './currency.service';
import {
  ApplyCurrencyRecalculationDto,
  ConvertCurrencyQueryDto,
  CreateCurrencyRateDto,
  CurrencyRecalculationDto,
  ListCurrencyRatesQueryDto,
} from './dto/currency.dto';

/**
 * Admin-only manual currency rates (SS-900). No public/storefront route is
 * exposed: customers see Rial only. Writes are ADMIN-only; reads are also
 * ADMIN because no operator workflow currently needs conversion.
 */
@ApiTags('admin-currency')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN)
@Controller('admin/currency-rates')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get()
  @ApiOperation({ summary: 'List manual FX rate history and current values' })
  @ApiResponse({ status: 200, description: 'Rates returned.' })
  async list(@Query() query: ListCurrencyRatesQueryDto) {
    return this.currencyService.list(query.currency, query.page ?? 1, query.limit ?? 50);
  }

  @Post()
  @ApiOperation({ summary: 'Append a manual USD/AED → Rial rate' })
  @ApiResponse({ status: 201, description: 'Rate created.' })
  @ApiResponse({ status: 400, description: 'Invalid rate.' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCurrencyRateDto,
    @Ip() ipAddress?: string,
  ) {
    return this.currencyService.create(dto, user.userId, ipAddress);
  }

  @Get('convert')
  @ApiOperation({ summary: 'Convert a foreign amount with the current manual rate' })
  @ApiResponse({ status: 200, description: 'Conversion returned.' })
  @ApiResponse({ status: 404, description: 'No rate recorded.' })
  async convert(@Query() query: ConvertCurrencyQueryDto) {
    return this.currencyService.convert(query.currency, query.amount);
  }

  @Post('recalculate/preview')
  @ApiOperation({
    summary: 'Preview a manual-rate change across source-currency products',
  })
  @ApiResponse({ status: 200, description: 'Per-product conversion preview.' })
  async previewRecalculation(@Body() dto: CurrencyRecalculationDto) {
    return this.currencyService.previewRecalculation(dto);
  }

  @Post('recalculate')
  @ApiOperation({
    summary: 'Append the rate and atomically recalculate affected products',
  })
  @ApiResponse({ status: 201, description: 'Rate applied and prices updated.' })
  @ApiResponse({ status: 409, description: 'Stale preview / concurrent edit.' })
  async recalculate(
    @CurrentUser() user: AuthUser,
    @Body() dto: ApplyCurrencyRecalculationDto,
    @Ip() ipAddress?: string,
  ) {
    return this.currencyService.applyRecalculation(dto, user.userId, ipAddress);
  }
}
