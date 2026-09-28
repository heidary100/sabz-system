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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AppRole } from '../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AcceptRfqDto, CreateRfqDto, QuoteRfqDto, RfqListQueryDto } from './dto';
import { RfqService } from './rfq.service';

const UUID_PARAM = new ParseUUIDPipe({
  version: '4',
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});

/**
 * Request-for-quotation endpoints (SS-235 B2, pricing-engine.md §8).
 * Customer routes are `JwtAuthGuard`-only and self-scoped (partner-only
 * create, owner-or-operator reads, owner-only accept); operator quoting
 * adds `RolesGuard` (OPERATOR/ADMIN) — minimal handling until the full
 * admin UI (SS-240).
 */
@ApiTags('rfq')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rfq')
export class RfqController {
  constructor(private readonly rfqService: RfqService) {}

  @Post()
  @ApiOperation({ summary: 'Request a quotation for a call-for-price variant' })
  @ApiResponse({ status: 201, description: 'RFQ created (PENDING).' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({
    status: 403,
    description: 'Only approved partners may request quotations.',
  })
  @ApiResponse({
    status: 422,
    description: 'Variant is not quotable (priced or unpublished).',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRfqDto,
    @Ip() ipAddress?: string,
  ) {
    return this.rfqService.create(user.userId, dto, ipAddress);
  }

  @Get()
  @ApiOperation({ summary: 'List RFQs (own rows; every row for operators)' })
  @ApiResponse({ status: 200, description: 'RFQ list returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: RfqListQueryDto,
  ) {
    const operator = await this.rfqService.isOperator(user.userId);
    return this.rfqService.list(user.userId, query, operator);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Return a single RFQ (owner or operator)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'RFQ returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'RFQ not found.' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
  ) {
    const operator = await this.rfqService.isOperator(user.userId);
    return this.rfqService.detail(user.userId, id, operator);
  }

  @Patch(':id/quote')
  @UseGuards(RolesGuard)
  @Roles(AppRole.OPERATOR, AppRole.ADMIN)
  @ApiOperation({ summary: 'Operator prices a pending RFQ (→ QUOTED)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Quotation recorded.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'RFQ not found.' })
  @ApiResponse({ status: 409, description: 'RFQ is not quotable.' })
  async quote(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Body() dto: QuoteRfqDto,
    @Ip() ipAddress?: string,
  ) {
    return this.rfqService.quote(user.userId, id, dto, ipAddress);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(AppRole.OPERATOR, AppRole.ADMIN)
  @ApiOperation({ summary: 'Operator declines a pending or quoted RFQ' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'RFQ rejected.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'RFQ not found.' })
  async reject(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Ip() ipAddress?: string,
  ) {
    return this.rfqService.reject(user.userId, id, ipAddress);
  }

  @Post(':id/accept')
  @ApiOperation({
    summary: 'Accept a live quotation (freezes the quoted price into an order)',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Order created from quotation.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'RFQ not found.' })
  @ApiResponse({ status: 409, description: 'RFQ is not acceptable.' })
  @ApiResponse({ status: 410, description: 'Quotation expired.' })
  async accept(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Body() dto: AcceptRfqDto,
    @Ip() ipAddress?: string,
  ) {
    return this.rfqService.accept(user.userId, id, dto, ipAddress);
  }
}
