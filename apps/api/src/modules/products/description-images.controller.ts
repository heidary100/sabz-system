import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
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
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AppRole } from '../auth/enums/app-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { DescriptionImageService } from './description-image.service';
import { resolveProductMediaTempDir } from './media-upload.config';
import { ImportDescriptionImageDto } from './dto';
import { MAX_DESCRIPTION_IMAGE_SIZE_BYTES } from './media-validation';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
const MAX_UPLOAD_BYTES = MAX_DESCRIPTION_IMAGE_SIZE_BYTES;
/** Description images are images only (JPG/PNG/WEBP) — videos are rejected. */
const DESCRIPTION_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Inline rich-text description image endpoints.
 *
 * Upload is product-scoped and requires OPERATOR/ADMIN. Serving is public and
 * read-only: the returned relative URL (`/api/v1/description-images/<file>`)
 * streams the stored image for both the admin preview and the storefront.
 */
@ApiTags('admin-products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/products')
export class AdminDescriptionImagesController {
  constructor(private readonly descriptionImageService: DescriptionImageService) {}

  @Post(':productId/description-images')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        // Resolved per request (not at import time) so a PRODUCT_MEDIA_TEMP_DIR
        // set in a .env file applies — matching the service provider and the
        // startup sweep.
        destination: (_request, _file, callback) =>
          callback(null, resolveProductMediaTempDir()),
        filename: (_request, _file, callback) => callback(null, randomUUID()),
      }),
      defParamCharset: 'utf8',
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_request, file, callback) => {
        if (!DESCRIPTION_IMAGE_MIME_TYPES.includes(file.mimetype)) {
          callback(
            new BadRequestException(
              'فرمت فایل پشتیبانی نمیشود. فقط JPG، PNG و WEBP مجاز است.',
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
    description: 'Description image file (JPG/PNG/WEBP, up to 5 MB)',
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload an image for embedding in the product description' })
  @ApiParam({ name: 'productId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Image uploaded; public URL returned.' })
  @ApiResponse({ status: 400, description: 'Invalid file.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @ApiResponse({ status: 409, description: 'Archived product.' })
  async upload(
    @Param('productId', UUID_PARAM) productId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    if (!file) {
      throw new BadRequestException('فایل الزامی است.');
    }
    return this.descriptionImageService.upload(productId, file, user.userId, ipAddress);
  }

  @Post(':productId/description-images/from-url')
  @ApiOperation({
    summary:
      'Import an external image URL into controlled description-image storage',
  })
  @ApiParam({ name: 'productId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Image imported; public URL returned.' })
  @ApiResponse({ status: 400, description: 'Invalid URL or non-image content.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @ApiResponse({ status: 409, description: 'Archived product.' })
  async importFromUrl(
    @Param('productId', UUID_PARAM) productId: string,
    @Body() dto: ImportDescriptionImageDto,
    @CurrentUser() user: AuthUser,
    @Ip() ipAddress?: string,
  ) {
    return this.descriptionImageService.importFromUrl(
      productId,
      dto.url,
      user.userId,
      ipAddress,
    );
  }
}

/**
 * Public read-only serving of inline description images. No auth guard: the
 * images are referenced inside product descriptions rendered to customers.
 * File names are strictly validated against the server-generated format, so
 * this endpoint can never be used to traverse storage.
 */
@ApiTags('description-images')
@Controller('description-images')
export class PublicDescriptionImagesController {
  constructor(private readonly descriptionImageService: DescriptionImageService) {}

  @Get(':file')
  // Immutable server-generated assets: exempt from per-IP throttling so a
  // product page with many images can render without being rate-limited.
  @SkipThrottle()
  @ApiOperation({ summary: 'Serve a public description image' })
  @ApiParam({ name: 'file', type: 'string', description: '<uuid>.<ext>' })
  @ApiResponse({ status: 200, description: 'Image streamed.' })
  @ApiResponse({ status: 404, description: 'Image not found.' })
  async get(
    @Param('file') file: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { stream, mimeType } = await this.descriptionImageService.getPublic(file);
    // Server-generated UUID keys never change, so images are immutable.
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return new StreamableFile(stream, { type: mimeType });
  }
}