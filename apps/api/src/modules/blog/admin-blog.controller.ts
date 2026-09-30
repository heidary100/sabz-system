import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { Roles } from '../auth/decorators/roles.decorator';
import { AppRole } from '../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlogService } from './blog.service';
import { ListAdminBlogPostsQueryDto } from './dto';

const UUID_PARAM = new ParseUUIDPipe({
  version: '4',
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});

/**
 * Operator blog queue (SS-240E). OPERATOR/ADMIN only, unscoped reads across
 * DRAFT and PUBLISHED rows; the storefront keeps using the PUBLISHED-only
 * `blog/` controller. Writes stay on `blog/` (SS-238) — this controller is
 * the missing admin read surface only.
 */
@ApiTags('admin-blog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/blog/posts')
export class AdminBlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @ApiOperation({ summary: 'List posts for the admin queue, newest first' })
  @ApiResponse({ status: 200, description: 'Posts returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: ListAdminBlogPostsQueryDto) {
    return this.blogService.listForAdmin({
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin post detail by id (any status)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Post returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Post not found.' })
  async getById(@Param('id', UUID_PARAM) id: string) {
    return this.blogService.getPostByIdForAdmin(id);
  }
}
