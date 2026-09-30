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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CreateReturnRequestDto, ReturnListQueryDto } from './dto';
import { ReturnsService } from './returns.service';

/**
 * Owner return endpoints (SS-242). All routes are authenticated
 * (`JwtAuthGuard`, no roles — self-owned customer state) and scoped to the
 * caller's userId; unknown/other-user ids are non-disclosure 404s.
 * Only owned DELIVERED orders inside the return window are eligible.
 */
@ApiTags('returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  @ApiOperation({ summary: 'Request a return for a delivered order' })
  @ApiResponse({ status: 201, description: 'Return requested.' })
  @ApiResponse({ status: 400, description: 'Invalid input.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  @ApiResponse({ status: 409, description: 'An open return already exists.' })
  @ApiResponse({ status: 422, description: 'Order is not return-eligible.' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReturnRequestDto,
    @Ip() ipAddress?: string,
  ) {
    return this.returnsService.create(user.userId, dto, ipAddress);
  }

  @Get()
  @ApiOperation({ summary: 'List the authenticated user\u2019s returns (newest first)' })
  @ApiResponse({ status: 200, description: 'Returns returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ReturnListQueryDto,
  ) {
    return this.returnsService.list(user.userId, {
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of the user\u2019s returns' })
  @ApiParam({ name: 'id', description: 'Return id' })
  @ApiResponse({ status: 200, description: 'Return returned.' })
  @ApiResponse({ status: 400, description: 'Invalid return id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Return not found.' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.returnsService.detail(user.userId, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a PENDING return request' })
  @ApiParam({ name: 'id', description: 'Return id' })
  @ApiResponse({ status: 200, description: 'Return cancelled.' })
  @ApiResponse({ status: 400, description: 'Invalid return id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Return not found.' })
  @ApiResponse({ status: 409, description: 'Return is no longer cancellable.' })
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Ip() ipAddress?: string,
  ) {
    return this.returnsService.cancel(user.userId, id, ipAddress);
  }
}
