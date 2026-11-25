import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Best-effort cross-app cache invalidation (SS-217).
 *
 * After a committed catalog mutation, POSTs the affected tags to the
 * storefront's secured `/api/revalidate` endpoint so cached catalog reads
 * drop immediately instead of waiting out their revalidate windows.
 *
 * Contract:
 * - never throws and never fails the mutation — invalidation failures are
 *   logged and absorbed (the storefront revalidate windows bound staleness);
 * - with no STOREFRONT_REVALIDATE_URL configured (local dev, tests) it is a
 *   no-op, so storefront-only or API-only workflows keep working;
 * - deduplicates tags before sending; one HTTP request per call, callers
 *   working in bulk (importer) pass a collected tag list once.
 */
@Injectable()
export class StorefrontCacheService {
  private readonly logger = new Logger(StorefrontCacheService.name);

  constructor(private readonly configService: ConfigService) {}

  async invalidate(tags: string[]): Promise<void> {
    const uniqueTags = [...new Set(tags)];
    if (uniqueTags.length === 0) {
      return;
    }

    const url = this.configService.get<string>('STOREFRONT_REVALIDATE_URL');
    const token = this.configService.get<string>('STOREFRONT_REVALIDATE_TOKEN');
    if (!url || !token) {
      this.logger.debug(
        `Storefront revalidation skipped (${uniqueTags.length} tags): STOREFRONT_REVALIDATE_URL/TOKEN not configured.`,
      );
      return;
    }

    // The storefront endpoint accepts at most 64 tags per request. Chunk so a
    // category/subtree change with many product detail tags still invalidates
    // every affected page instead of failing the whole request.
    for (let index = 0; index < uniqueTags.length; index += 64) {
      const chunk = uniqueTags.slice(index, index + 64);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-revalidate-token': token,
          },
          body: JSON.stringify({ tags: chunk }),
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) {
          this.logger.warn(
            `Storefront revalidation failed (${response.status}) for tags: ${chunk.join(', ')}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Storefront revalidation request failed for tags [${chunk.join(', ')}]: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
