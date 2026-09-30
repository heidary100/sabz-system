import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CheckoutService } from './checkout.service';
import { ValidateCheckoutDto } from './dto';

/**
 * Customer checkout endpoints (SS-233). Authenticated (`JwtAuthGuard`, no
 * roles — self-owned customer state). `validate` is a read-only preview
 * for the wizard review step; the money-moving flow lives on
 * `POST /orders/checkout`. Shipping/payment choice lists are static v1
 * stubs (real fees SS-241, gateway SS-234B — SS-234 ships COD-only with
 * ONLINE listed but disabled).
 */
@ApiTags('checkout')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get('shipping-methods')
  @ApiOperation({ summary: 'List available shipping methods (v1 static list)' })
  @ApiResponse({ status: 200, description: 'Shipping methods returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async shippingMethods() {
    return this.checkoutService.shippingMethods();
  }

  @Get('payment-methods')
  @ApiOperation({ summary: 'List available payment methods (v1 static list)' })
  @ApiResponse({ status: 200, description: 'Payment methods returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async paymentMethods() {
    return this.checkoutService.paymentMethods();
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate the cart for checkout (no side effects)' })
  @ApiResponse({ status: 200, description: 'Checkout summary returned.' })
  @ApiResponse({ status: 400, description: 'Invalid addressId.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Address not found.' })
  async validate(
    @CurrentUser() user: AuthUser,
    @Body() dto: ValidateCheckoutDto,
  ) {
    return this.checkoutService.validate(user.userId, dto.addressId, dto.shippingMethod);
  }
}
