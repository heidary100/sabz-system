import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MerchMediaService } from './merch-media.service';

const UUID_PARAM = new ParseUUIDPipe({
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});

/**
 * Publication-gated public delivery (Task 05.2).
 *
 * A media row is public only when Task 05.6 has set `publishedAt` on it as
 * part of the current published homepage. Upload/campaign attachment alone
 * never makes a row public. Cache lifetime is deliberately short because
 * publication eligibility can be withdrawn.
 */
@ApiTags('catalog')
@Controller('catalog/merch-media')
export class PublicMerchMediaController {
  constructor(private readonly mediaService: MerchMediaService) {}

  @Get(':id')
  @SkipThrottle()
  @ApiOperation({ summary: 'Serve published merchandising media' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Media streamed.' })
  @ApiResponse({ status: 404, description: 'Media is not published or not found.' })
  async file(
    @Param('id', UUID_PARAM) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { stream, mimeType, sizeBytes } =
      await this.mediaService.getPublicStream(id);
    response.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
    return new StreamableFile(stream, { type: mimeType, length: sizeBytes });
  }

  @Get(':id/thumbnail')
  @SkipThrottle()
  @ApiOperation({ summary: 'Serve published merchandising media thumbnail' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Thumbnail streamed.' })
  @ApiResponse({ status: 404, description: 'Media is not published or not found.' })
  async thumbnail(
    @Param('id', UUID_PARAM) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { stream } = await this.mediaService.getPublicThumbnail(id);
    response.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
    return new StreamableFile(stream, { type: 'image/webp' });
  }
}
