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
import { CreateReviewDto, ListProductReviewsQueryDto } from './dto';
import { ReviewsService } from './reviews.service';

const UUID_PARAM = new ParseUUIDPipe({
  version: '4',
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});

/**
 * Product-review endpoints (SS-236, master plan §5.8). Filing is
 * `JwtAuthGuard`-only (any authenticated customer, one review per
 * user×product); the product list is public but APPROVED-only; moderation
 * adds `RolesGuard` (OPERATOR/ADMIN) — minimal handling until the full
 * admin UI (SS-240).
 */
@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'File a review for a published product (→ PENDING)' })
  @ApiResponse({ status: 201, description: 'Review filed (PENDING).' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Product not found or not published.' })
  @ApiResponse({ status: 409, description: 'Product already reviewed by this user.' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReviewDto,
    @Ip() ipAddress?: string,
  ) {
    return this.reviewsService.create(user.userId, dto, ipAddress);
  }

  @Get('product/:productId')
  @ApiOperation({ summary: 'List approved reviews of a product (public)' })
  @ApiParam({ name: 'productId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Approved reviews returned.' })
  @ApiResponse({ status: 404, description: 'Product not found or not published.' })
  async listByProduct(
    @Param('productId', UUID_PARAM) productId: string,
    @Query() query: ListProductReviewsQueryDto,
  ) {
    return this.reviewsService.listByProduct(productId, query);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.OPERATOR, AppRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Operator approves a pending review (→ APPROVED)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Review approved.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Review not found.' })
  @ApiResponse({ status: 409, description: 'Review already moderated.' })
  async approve(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Ip() ipAddress?: string,
  ) {
    return this.reviewsService.approve(user.userId, id, ipAddress);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.OPERATOR, AppRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Operator rejects a pending review (→ REJECTED)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Review rejected.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Review not found.' })
  @ApiResponse({ status: 409, description: 'Review already moderated.' })
  async reject(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Ip() ipAddress?: string,
  ) {
    return this.reviewsService.reject(user.userId, id, ipAddress);
  }
}
