import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { AppRole } from '../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CategoriesService } from './categories.service';
import { OversizedUploadFilter } from '../partners/oversized-upload.filter';
import { resolveProductMediaTempDir } from './media-upload.config';
import {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  ReorderCategoryDto,
  UpdateCategoryDto,
} from './dto';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('admin-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/categories')
@UseFilters(OversizedUploadFilter)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List categories with pagination' })
  @ApiResponse({ status: 200, description: 'Paginated category summaries.' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: ListCategoriesQueryDto) {
    return this.categoriesService.list(query);
  }

  @Get('tree')
  @ApiOperation({ summary: 'Return the full category tree with active product counts' })
  @ApiResponse({ status: 200, description: 'Category tree returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async getTree() {
    return this.categoriesService.getTree();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Return a single category detail with children' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Category detail returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  async getDetail(@Param('id', UUID_PARAM) categoryId: string) {
    return this.categoriesService.getDetail(categoryId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a category' })
  @ApiResponse({ status: 201, description: 'Category created.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Parent category not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate slug.' })
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.categoriesService.create(dto, user.userId, ipAddress);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category (including hierarchy move)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Category updated.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate slug or hierarchy conflict.' })
  async update(
    @Param('id', UUID_PARAM) categoryId: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.categoriesService.update(categoryId, dto, user.userId, ipAddress);
  }

  @Patch(':id/reorder')
  @ApiOperation({ summary: 'Move a category and reposition it among its siblings' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Category reordered.' })
  @ApiResponse({ status: 400, description: 'Invalid body.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @ApiResponse({ status: 409, description: 'Hierarchy conflict.' })
  async reorder(
    @Param('id', UUID_PARAM) categoryId: string,
    @Body() dto: ReorderCategoryDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.categoriesService.reorder(categoryId, dto, user.userId, ipAddress);
  }

  @Post(':id/image')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          const dir = resolveProductMediaTempDir();
          try {
            mkdirSync(dir, { recursive: true });
          } catch (error) {
            callback(error as Error, dir);
            return;
          }
          callback(null, dir);
        },
        filename: (_request, _file, callback) => callback(null, randomUUID()),
      }),
      defParamCharset: 'utf8',
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
          callback(
            new BadRequestException('فقط تصویر JPG، PNG یا WEBP مجاز است.'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload or replace the editorial category image' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async uploadImage(
    @Param('id', UUID_PARAM) categoryId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    if (!file) {
      throw new BadRequestException('فایل تصویر دسته‌بندی الزامی است.');
    }
    return this.categoriesService.uploadImage(categoryId, file, user.userId, ipAddress);
  }

  @Delete(':id/image')
  @ApiOperation({ summary: 'Remove the editorial category image' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async removeImage(
    @Param('id', UUID_PARAM) categoryId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.categoriesService.removeImage(categoryId, user.userId, ipAddress);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Soft-delete a category with no active children or active product references',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Category soft-deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @ApiResponse({ status: 409, description: 'Category has children or active product references.' })
  async softDelete(
    @Param('id', UUID_PARAM) categoryId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.categoriesService.softDelete(categoryId, user.userId, ipAddress);
  }
}
