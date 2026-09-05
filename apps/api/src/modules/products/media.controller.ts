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
  Post,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AppRole } from '../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { buildMediaAttachmentDisposition } from './download-media-disposition';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto';
import { OversizedUploadFilter } from '../partners/oversized-upload.filter';
import { resolveProductMediaTempDir } from './media-upload.config';
import { ALLOWED_MEDIA_MIME_TYPES, MAX_VIDEO_SIZE_BYTES } from './media-validation';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
// The multer hard cap is the video limit (200 MB). Images keep their 10 MB cap
// and are rejected with the correct per-type message by the service-level
// validation after the (still small) image body reaches disk.
const MAX_UPLOAD_BYTES = MAX_VIDEO_SIZE_BYTES;

/**
 * Product media endpoints (SS-105). Upload/list/download are product-scoped
 * (the owning product id always comes from the route param, never the client
 * body); delete is media-id-scoped (matching the admin/variants convention).
 * All endpoints require OPERATOR/ADMIN.
 */
@ApiTags('admin-products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/products')
@UseFilters(OversizedUploadFilter)
export class ProductMediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post(':productId/media')
  @UseInterceptors(
    FileInterceptor('file', {
      // Uploads stream to a server-generated temp file on disk, never a memory
      // buffer: a 200 MB video must not be held in a Node.js heap. The temp
      // file is validated and watermarked by the media pipeline, then moved
      // into the final storage key. All temp paths are server-generated.
      storage: diskStorage({
        // Resolved per request (not at import time) so a PRODUCT_MEDIA_TEMP_DIR
        // set in a .env file applies — matching the service provider and the
        // startup sweep.
        destination: (_request, _file, callback) =>
          callback(null, resolveProductMediaTempDir()),
        filename: (_request, _file, callback) => callback(null, randomUUID()),
      }),
      // defParamCharset: busboy otherwise decodes the multipart filename
      // parameter as latin1, mangling non-ASCII (e.g. Persian) filenames.
      defParamCharset: 'utf8',
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_request, file, callback) => {
        if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.mimetype as never)) {
          callback(
            new BadRequestException(
              'فرمت فایل پشتیبانی نمیشود. فقط JPG، PNG، WEBP و MP4 مجاز است.',
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
    description:
      'Product media file and optional fields. Images up to 10 MB, videos up to 200 MB.',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        mediaType: { type: 'string', enum: ['IMAGE', 'VIDEO'] },
        variantId: { type: 'string', format: 'uuid' },
        isPrimary: { type: 'boolean' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a product image or video' })
  @ApiParam({ name: 'productId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Media uploaded.' })
  @ApiResponse({ status: 400, description: 'Invalid file.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Product or variant not found.' })
  @ApiResponse({ status: 409, description: 'Archived product or media type mismatch.' })
  async upload(
    @Param('productId', UUID_PARAM) productId: string,
    @Body() dto: UploadMediaDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    if (!file) {
      throw new BadRequestException('فایل الزامی است.');
    }
    return this.mediaService.upload(productId, file, dto, user.userId, ipAddress);
  }

  @Get(':productId/media')
  @ApiOperation({ summary: 'List active media of a product' })
  @ApiParam({ name: 'productId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Media summaries returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  async list(@Param('productId', UUID_PARAM) productId: string) {
    return this.mediaService.list(productId);
  }

  @Get(':productId/media/:mediaId')
  @ApiOperation({ summary: 'Download/preview one product media binary' })
  @ApiParam({ name: 'productId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'mediaId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Media binary returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Media not found.' })
  async download(
    @Param('productId', UUID_PARAM) productId: string,
    @Param('mediaId', UUID_PARAM) mediaId: string,
  ) {
    const { stream, summary } = await this.mediaService.getBinaryStream(
      productId,
      mediaId,
    );

    return new StreamableFile(stream, {
      type: summary.mimeType,
      disposition: buildMediaAttachmentDisposition(summary),
      length: summary.sizeBytes,
    });
  }
}

/**
 * Media-id-scoped delete endpoint (mirrors the admin/variants convention).
 */
@ApiTags('admin-media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/media')
export class AdminMediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a product media and remove its binary' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Media removed.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Media not found.' })
  async remove(
    @Param('id', UUID_PARAM) mediaId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    await this.mediaService.remove(mediaId, user.userId, ipAddress);
    return { removed: true };
  }
}
