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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AppRole } from '../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ListAdminReturnsQueryDto, RejectReturnDto } from './dto';
import { ReturnsService } from './returns.service';

/**
 * Operator return management (SS-242). OPERATOR/ADMIN only, unscoped reads
 * across all owners; customers keep using the self-scoped `returns/`
 * controller. Lifecycle: PENDING → APPROVED/REJECTED → RECEIVED →
 * COMPLETED; owners may cancel while PENDING.
 */
@ApiTags('admin-returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/returns')
export class AdminReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  @ApiOperation({ summary: 'List returns for review, newest first (operators)' })
  @ApiResponse({ status: 200, description: 'Returns returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: ListAdminReturnsQueryDto) {
    return this.returnsService.listForAdmin({
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get any return with owner identity (operators)' })
  @ApiParam({ name: 'id', description: 'Return id' })
  @ApiResponse({ status: 200, description: 'Return returned.' })
  @ApiResponse({ status: 400, description: 'Invalid return id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Return not found.' })
  async detail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.returnsService.adminDetail(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a PENDING return (operators)' })
  @ApiParam({ name: 'id', description: 'Return id' })
  @ApiResponse({ status: 200, description: 'Return approved.' })
  @ApiResponse({ status: 400, description: 'Invalid return id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Return not found.' })
  @ApiResponse({ status: 409, description: 'Return is not approvable.' })
  async approve(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Ip() ipAddress?: string,
  ) {
    return this.returnsService.approve(user.userId, id, ipAddress);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a PENDING return (operators)' })
  @ApiParam({ name: 'id', description: 'Return id' })
  @ApiResponse({ status: 200, description: 'Return rejected.' })
  @ApiResponse({ status: 400, description: 'Invalid return id or reason.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Return not found.' })
  @ApiResponse({ status: 409, description: 'Return is not rejectable.' })
  async reject(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RejectReturnDto,
    @Ip() ipAddress?: string,
  ) {
    return this.returnsService.reject(user.userId, id, dto.reason, ipAddress);
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an APPROVED return received (operators)' })
  @ApiParam({ name: 'id', description: 'Return id' })
  @ApiResponse({ status: 200, description: 'Return marked received.' })
  @ApiResponse({ status: 400, description: 'Invalid return id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Return not found.' })
  @ApiResponse({ status: 409, description: 'Return is not receivable.' })
  async receive(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Ip() ipAddress?: string,
  ) {
    return this.returnsService.receive(user.userId, id, ipAddress);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a RECEIVED return after inspection (operators)' })
  @ApiParam({ name: 'id', description: 'Return id' })
  @ApiResponse({ status: 200, description: 'Return completed.' })
  @ApiResponse({ status: 400, description: 'Invalid return id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Return not found.' })
  @ApiResponse({ status: 409, description: 'Return is not completable.' })
  async complete(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Ip() ipAddress?: string,
  ) {
    return this.returnsService.complete(user.userId, id, ipAddress);
  }
}
