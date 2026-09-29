import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { AppRole } from '../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ListAdminReviewsQueryDto } from './dto';
import { ReviewsService } from './reviews.service';

/**
 * Operator review moderation queue (SS-240D). OPERATOR/ADMIN only, unscoped
 * reads across all products; customers keep using the self-scoped `reviews/`
 * controller. Approve/reject stay on `reviews/:id/*` (SS-236) — this
 * controller is the missing queue endpoint only.
 */
@ApiTags('admin-reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'List reviews for moderation, newest first' })
  @ApiResponse({ status: 200, description: 'Reviews returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: ListAdminReviewsQueryDto) {
    return this.reviewsService.listForModeration({
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }
}
