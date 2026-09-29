import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CheckoutService } from './checkout.service';
import { OrderListQueryDto, UpdateOrderStatusDto } from './dto';

/**
 * Operator order management (SS-240A). OPERATOR/ADMIN only, unscoped reads
 * across all users; customers keep using the self-scoped `orders/`
 * controller. Transitions enforce the legal lifecycle (forward moves plus
 * CANCELLED); COD flips to PAID exactly on the DELIVERED transition.
 */
@ApiTags('admin-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get()
  @ApiOperation({ summary: 'List all orders, newest first (operators)' })
  @ApiResponse({ status: 200, description: 'Orders returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: OrderListQueryDto) {
    return this.checkoutService.listAllOrders({
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get any order with owner + mobile (operators)' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiResponse({ status: 200, description: 'Order returned.' })
  @ApiResponse({ status: 400, description: 'Invalid order id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  async detail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.checkoutService.adminDetail(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transition an order to its next status (operators)' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiResponse({ status: 200, description: 'Order transitioned.' })
  @ApiResponse({ status: 400, description: 'Invalid order id or status.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  @ApiResponse({ status: 409, description: 'Illegal transition.' })
  async transition(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Ip() ipAddress?: string,
  ) {
    return this.checkoutService.transitionStatus(
      user.userId,
      id,
      dto.status,
      ipAddress,
    );
  }
}
