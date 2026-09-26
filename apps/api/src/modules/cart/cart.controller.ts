import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CartService } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto';

/**
 * Customer shopping-cart endpoints (SS-232). All routes are authenticated
 * (`JwtAuthGuard`, no roles — self-owned customer state) and scoped to the
 * caller's userId; there is no public or cross-user access. Guests have no
 * server cart: the storefront keeps a localStorage cart and replays it
 * through these endpoints after login.
 */
@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated user\u2019s cart' })
  @ApiResponse({ status: 200, description: 'Cart returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async get(@CurrentUser() user: AuthUser) {
    return this.cartService.list(user.userId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add to the cart by variant, or quick-add by product (increments when the line exists)' })
  @ApiResponse({ status: 201, description: 'Line created.' })
  @ApiResponse({ status: 200, description: 'Line already existed; quantity incremented.' })
  @ApiResponse({ status: 400, description: 'Invalid identity (exactly one of variantId/productId) or quantity.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Variant/product not found or not published.' })
  @ApiResponse({ status: 409, description: 'Requested quantity exceeds available stock.' })
  @ApiResponse({ status: 422, description: 'No purchasable variant (call-for-price).' })
  async add(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddCartItemDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { item, created } = await this.cartService.add(
      user.userId,
      { variantId: dto.variantId, productId: dto.productId },
      dto.quantity,
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return item;
  }

  @Patch('items/:variantId')
  @ApiOperation({ summary: 'Set a cart line quantity (absolute)' })
  @ApiParam({ name: 'variantId', description: 'Cart line variant id' })
  @ApiResponse({ status: 200, description: 'Quantity updated.' })
  @ApiResponse({ status: 400, description: 'Invalid variantId or quantity.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Variant not found, unpublished, or not in the cart.' })
  @ApiResponse({ status: 409, description: 'Requested quantity exceeds available stock.' })
  @ApiResponse({ status: 422, description: 'Variant is not purchasable (call-for-price).' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('variantId', new ParseUUIDPipe({ version: '4' })) variantId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.setQuantity(user.userId, variantId, dto.quantity);
  }

  @Delete('items/:variantId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a variant from the cart' })
  @ApiParam({ name: 'variantId', description: 'Cart line variant id' })
  @ApiResponse({ status: 200, description: 'Removal result returned.' })
  @ApiResponse({ status: 400, description: 'Invalid variantId.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('variantId', new ParseUUIDPipe({ version: '4' })) variantId: string,
  ) {
    return this.cartService.remove(user.userId, variantId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear all cart lines' })
  @ApiResponse({ status: 200, description: 'Cart cleared.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async clear(@CurrentUser() user: AuthUser) {
    return this.cartService.clear(user.userId);
  }
}
