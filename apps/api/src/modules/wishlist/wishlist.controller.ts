import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { AddWishlistDto } from './dto';
import { WishlistService } from './wishlist.service';

/**
 * Customer wishlist endpoints (SS-231). All routes are authenticated
 * (`JwtAuthGuard`, no roles — self-owned customer state) and scoped to the
 * caller's userId; there is no public or cross-user access.
 */
@ApiTags('wishlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'List the authenticated user\u2019s wishlist' })
  @ApiResponse({ status: 200, description: 'Wishlist returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async list(@CurrentUser() user: AuthUser) {
    return this.wishlistService.list(user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Save a published product to the wishlist' })
  @ApiResponse({ status: 201, description: 'Product saved.' })
  @ApiResponse({ status: 200, description: 'Product was already saved.' })
  @ApiResponse({ status: 400, description: 'Invalid productId.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Product not found or not published.' })
  async add(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddWishlistDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { item, created } = await this.wishlistService.add(
      user.userId,
      dto.productId,
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return item;
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a product from the wishlist' })
  @ApiParam({ name: 'productId', description: 'Wishlisted product id' })
  @ApiResponse({ status: 200, description: 'Removal result returned.' })
  @ApiResponse({ status: 400, description: 'Invalid productId.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ) {
    return this.wishlistService.remove(user.userId, productId);
  }
}
