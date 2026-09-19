import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { MediaService } from './media.service';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/**
 * Public read-only serving of catalog product media (SS-123). No auth guard:
 * the watermarked assets are rendered to storefront customers. The media id is
 * validated as a strict UUID and the owning product must be PUBLISHED and not
 * soft-deleted, so this endpoint can only serve assets that belong to the live
 * catalog; storage keys are never exposed.
 */
@ApiTags('catalog')
@Controller('catalog/media')
export class PublicProductMediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get(':mediaId')
  // Immutable server-generated assets: exempt from per-IP throttling so a
  // product page with many images can render without being rate-limited.
  @SkipThrottle()
  @ApiOperation({ summary: 'Serve a public catalog product media asset' })
  @ApiParam({ name: 'mediaId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Asset streamed.' })
  @ApiResponse({
    status: 404,
    description:
      'Media not found, soft-deleted, or its product is not a published, non-deleted product.',
  })
  async get(
    @Param('mediaId', UUID_PARAM) mediaId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { stream, mimeType, sizeBytes } =
      await this.mediaService.getPublicStream(mediaId);
    // Server-generated UUID keys never change, so assets are immutable.
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // Declared length lets clients and proxies detect truncation and lets
    // browsers show progress on large (200 MB) videos.
    return new StreamableFile(stream, { type: mimeType, length: sizeBytes });
  }

  @Get(':mediaId/thumbnail')
  // Immutable server-generated assets: exempt from per-IP throttling so a
  // product page with many images can render without being rate-limited.
  @SkipThrottle()
  @ApiOperation({ summary: 'Serve the watermarked thumbnail of a catalog media asset' })
  @ApiParam({ name: 'mediaId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'WEBP thumbnail streamed.' })
  @ApiResponse({
    status: 404,
    description:
      'Media not found, no thumbnail exists, or its product is not published.',
  })
  async thumbnail(
    @Param('mediaId', UUID_PARAM) mediaId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { stream, sizeBytes } =
      await this.mediaService.getPublicThumbnail(mediaId);
    // Thumbnails are derived once from the immutable original.
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return new StreamableFile(stream, {
      type: 'image/webp',
      length: sizeBytes,
    });
  }
}
