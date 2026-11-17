import { Controller, Get, Headers, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  generatePublicHomepageEtag,
  ifNoneMatchMatches,
} from './public-homepage-etag';
import { PublicHomepageService } from './public-homepage.service';

/**
 * Public homepage resolver (Task 05.5). No auth guard by contract: only the
 * current PUBLISHED snapshot is exposed, and catalog/media services filter
 * every live reference for public eligibility.
 */
@ApiTags('catalog')
@Controller('catalog/homepage')
export class PublicHomepageController {
  constructor(private readonly homepageService: PublicHomepageService) {}

  @Get()
  @ApiOperation({ summary: 'Resolved current homepage for the storefront' })
  @ApiResponse({ status: 200, description: 'Resolved homepage returned.' })
  @ApiResponse({ status: 304, description: 'Representation has not changed.' })
  @ApiResponse({
    status: 503,
    description: 'The current publication is malformed or cannot be resolved.',
  })
  async getHomepage(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const payload = await this.homepageService.getHomepage();
      const etag = generatePublicHomepageEtag(payload);
      response.setHeader(
        'Cache-Control',
        'public, max-age=10, must-revalidate',
      );
      response.setHeader('ETag', etag);
      if (ifNoneMatchMatches(ifNoneMatch, etag)) {
        response.status(304);
        return;
      }
      return payload;
    } catch (error) {
      // Never let an upstream/CDN cache an invalid-homepage response.
      response.setHeader('Cache-Control', 'no-store');
      throw error;
    }
  }
}
