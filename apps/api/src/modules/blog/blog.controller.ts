import {
  Body,
  Controller,
  Delete,
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
import { BlogService } from './blog.service';
import {
  CreateBlogCategoryDto,
  CreateBlogPostDto,
  ListBlogPostsQueryDto,
  UpdateBlogCategoryDto,
  UpdateBlogPostDto,
} from './dto';

const UUID_PARAM = new ParseUUIDPipe({
  version: '4',
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});

/**
 * Blog CMS endpoints (SS-238, master plan §5.10). Public reads serve
 * PUBLISHED rows only; operator writes add `RolesGuard` (OPERATOR/ADMIN) —
 * minimal handling until the full admin UI (SS-240). `categories` routes
 * are registered before `:slug` so the literal never matches the slug
 * param.
 */
@ApiTags('blog')
@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @ApiOperation({ summary: 'List published posts, newest first (public)' })
  @ApiResponse({ status: 200, description: 'Published posts returned.' })
  async listPosts(@Query() query: ListBlogPostsQueryDto) {
    return this.blogService.listPosts(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List blog categories (public)' })
  @ApiResponse({ status: 200, description: 'Blog categories returned.' })
  async listCategories() {
    return this.blogService.listCategories();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Published article by slug (public)' })
  @ApiParam({ name: 'slug', type: 'string' })
  @ApiResponse({ status: 200, description: 'Article returned.' })
  @ApiResponse({ status: 404, description: 'Article not found.' })
  async getPostBySlug(@Param('slug') slug: string) {
    return this.blogService.getPostBySlug(slug);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.OPERATOR, AppRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Operator creates an article (→ DRAFT unless published)' })
  @ApiResponse({ status: 201, description: 'Article created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @ApiResponse({ status: 409, description: 'Slug already taken.' })
  async createPost(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBlogPostDto,
    @Ip() ipAddress?: string,
  ) {
    return this.blogService.createPost(user.userId, dto, ipAddress);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.OPERATOR, AppRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Operator updates an article' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Article updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Article or category not found.' })
  @ApiResponse({ status: 409, description: 'Slug already taken.' })
  async updatePost(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Body() dto: UpdateBlogPostDto,
    @Ip() ipAddress?: string,
  ) {
    return this.blogService.updatePost(user.userId, id, dto, ipAddress);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.OPERATOR, AppRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Operator archives an article (→ DRAFT)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Article archived.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Article not found.' })
  async archivePost(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Ip() ipAddress?: string,
  ) {
    return this.blogService.archivePost(user.userId, id, ipAddress);
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.OPERATOR, AppRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Operator creates a blog category' })
  @ApiResponse({ status: 201, description: 'Category created.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 409, description: 'Slug already taken.' })
  async createCategory(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBlogCategoryDto,
    @Ip() ipAddress?: string,
  ) {
    return this.blogService.createCategory(user.userId, dto, ipAddress);
  }

  @Patch('categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.OPERATOR, AppRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Operator updates a blog category' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Category updated.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @ApiResponse({ status: 409, description: 'Slug already taken.' })
  async updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Body() dto: UpdateBlogCategoryDto,
    @Ip() ipAddress?: string,
  ) {
    return this.blogService.updateCategory(user.userId, id, dto, ipAddress);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.OPERATOR, AppRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Operator deletes an empty blog category' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Category deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @ApiResponse({ status: 409, description: 'Category still has posts.' })
  async deleteCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', UUID_PARAM) id: string,
    @Ip() ipAddress?: string,
  ) {
    return this.blogService.deleteCategory(user.userId, id, ipAddress);
  }
}
