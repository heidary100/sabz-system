import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { CheckoutService } from './checkout.service';
import { OrderListQueryDto, PlaceOrderDto } from './dto';

/**
 * Customer order endpoints (SS-233). All routes are authenticated
 * (`JwtAuthGuard`, no roles — self-owned customer state) and scoped to the
 * caller's userId; unknown/other-user ids are non-disclosure 404s.
 * Customers may only cancel PENDING orders; operator transitions live in
 * SS-240. Invoice is data for the storefront HTML print route (no PDF).
 */
@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Place an order from the cart (validates stock, prices from DB)' })
  @ApiResponse({ status: 201, description: 'Order created.' })
  @ApiResponse({ status: 400, description: 'Empty cart or invalid input.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Address/product not found.' })
  @ApiResponse({ status: 409, description: 'Insufficient stock or order not cancellable.' })
  @ApiResponse({ status: 422, description: 'Call-for-price line in the cart.' })
  async checkout(@CurrentUser() user: AuthUser, @Body() dto: PlaceOrderDto) {
    return this.checkoutService.placeOrder(
      user.userId,
      dto.addressId,
      dto.paymentMethod,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List the authenticated user\u2019s orders (newest first)' })
  @ApiResponse({ status: 200, description: 'Orders returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: OrderListQueryDto,
  ) {
    return this.checkoutService.listOrders(user.userId, {
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of the user\u2019s orders' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiResponse({ status: 200, description: 'Order returned.' })
  @ApiResponse({ status: 400, description: 'Invalid order id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.checkoutService.orderDetail(user.userId, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a PENDING order (restocks inventory)' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiResponse({ status: 200, description: 'Order cancelled.' })
  @ApiResponse({ status: 400, description: 'Invalid order id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  @ApiResponse({ status: 409, description: 'Order is no longer cancellable.' })
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.checkoutService.cancelOrder(user.userId, id);
  }

  @Get(':id/invoice')
  @ApiOperation({ summary: 'Get order invoice data (HTML print route source)' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiResponse({ status: 200, description: 'Invoice data returned.' })
  @ApiResponse({ status: 400, description: 'Invalid order id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  async invoice(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const detail = await this.checkoutService.orderDetail(user.userId, id);
    const customer = await this.checkoutService.customerMobile(user.userId);
    return { ...detail, customerMobile: customer };
  }
}
