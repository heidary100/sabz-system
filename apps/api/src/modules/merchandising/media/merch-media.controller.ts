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
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AppRole } from '../../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { OversizedUploadFilter } from '../../partners/oversized-upload.filter';
import { MAX_IMAGE_SIZE_BYTES } from '../../products/media-validation';
import { resolveProductMediaTempDir } from '../../products/media-upload.config';
import { ListMerchMediaQueryDto } from './dto/list-merch-media-query.dto';
import { UpdateMerchMediaDto } from './dto/update-merch-media.dto';
import { UploadMerchMediaDto } from './dto/upload-merch-media.dto';
import { MerchMediaService } from './merch-media.service';

const UUID_PARAM = new ParseUUIDPipe({
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});

const MERCH_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/**
 * Authenticated merchandising media library (Task 05.2).
 *
 * OPERATOR/ADMIN may upload and manage draft media. There is deliberately no
 * public route here: public delivery is a separate publication-gated controller.
 */
@ApiTags('admin-merchandising-media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/merchandising/media')
export class MerchMediaController {
  constructor(private readonly mediaService: MerchMediaService) {}

  @Post()
  @UseFilters(OversizedUploadFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_request, _file, callback) =>
          callback(null, resolveProductMediaTempDir()),
        filename: (_request, _file, callback) => callback(null, randomUUID()),
      }),
      defParamCharset: 'utf8',
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
      fileFilter: (_request, file, callback) => {
        if (!MERCH_IMAGE_MIME_TYPES.has(file.mimetype)) {
          callback(
            new BadRequestException(
              'فرمت فایل پشتیبانی نمی‌شود. فقط JPG، PNG و WEBP مجاز است.',
            ),
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
    description: 'Image file and optional Persian alt text.',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        altFa: { type: 'string', maxLength: 160 },
      },
    },
  })
  @ApiOperation({ summary: 'Upload unpublished merchandising media' })
  @ApiResponse({ status: 201, description: 'Media metadata returned.' })
  @ApiResponse({ status: 400, description: 'Invalid file or metadata.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMerchMediaDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.mediaService.upload(file, dto, user.userId, ipAddress);
  }

  @Get()
  @ApiOperation({ summary: 'List merchandising media (newest first)' })
  @ApiResponse({ status: 200, description: 'Paginated media metadata returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async list(@Query() query: ListMerchMediaQueryDto) {
    return this.mediaService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get merchandising media metadata and usage' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Media detail returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Media not found.' })
  async detail(@Param('id', UUID_PARAM) id: string) {
    return this.mediaService.getDetail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update editable merchandising media metadata' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateMerchMediaDto })
  @ApiResponse({ status: 200, description: 'Updated media metadata returned.' })
  @ApiResponse({ status: 400, description: 'Invalid or server-controlled field.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Media not found.' })
  async update(
    @Param('id', UUID_PARAM) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    // The global ValidationPipe whitelists rather than rejects extra fields;
    // using a raw body here lets the service reject storageKey/publishedAt/etc.
    return this.mediaService.update(id, body, user.userId, ipAddress);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete unreferenced merchandising media' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Media soft-deleted.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Media not found.' })
  @ApiResponse({ status: 409, description: 'Media is used by a campaign or publication.' })
  async remove(
    @Param('id', UUID_PARAM) id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.mediaService.remove(id, user.userId, ipAddress);
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Stream merchandising media (authenticated admin access)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Media binary streamed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Media not found.' })
  async file(
    @Param('id', UUID_PARAM) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { stream, mimeType, sizeBytes } = await this.mediaService.getAdminStream(id);
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(stream, { type: mimeType, length: sizeBytes });
  }

  @Get(':id/thumbnail')
  @ApiOperation({ summary: 'Stream merchandising media thumbnail (authenticated)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Thumbnail streamed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Media or thumbnail not found.' })
  async thumbnail(
    @Param('id', UUID_PARAM) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { stream } = await this.mediaService.getAdminThumbnail(id);
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(stream, { type: 'image/webp' });
  }
}
