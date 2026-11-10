import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  HomepageSnapshot,
  HomepageSnapshotSection,
  PublishedHomepageDto,
} from '@sabz/types';
import { PrismaService } from '../../../common/database/prisma.service';
import { validateHomepageSnapshot } from '../homepage-snapshot-validation';
import { PublicHomepageCache } from './public-homepage.cache';
import { PublicHomepageResolver } from './public-homepage.resolver';

/**
 * Public homepage read boundary (Task 05.5).
 *
 * Selects only the current PUBLISHED row, validates the immutable snapshot, and
 * resolves it through the typed section resolver. Scheduled/cancelled/superseded
 * rows are never fallbacks. A malformed current snapshot is not cached and
 * surfaces as a generic 503.
 */
@Injectable()
export class PublicHomepageService {
  private readonly logger = new Logger(PublicHomepageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PublicHomepageResolver,
    private readonly cache: PublicHomepageCache,
  ) {}

  async getHomepage(now: Date = new Date()): Promise<PublishedHomepageDto> {
    const publication = await this.prisma.homepagePublication.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        publishedAt: true,
        sections: true,
        schemaVersion: true,
      },
    });
    if (!publication) {
      return {
        version: null,
        schemaVersion: null,
        publishedAt: null,
        sections: [],
      };
    }

    const snapshot = readStoredSnapshot(
      publication.sections,
      publication.schemaVersion,
    );
    if (!snapshot) {
      this.logger.error(
        `Malformed stored snapshot for PUBLISHED homepage id=${publication.id} version=${publication.version}`,
      );
      throw new ServiceUnavailableException({
        error: 'HOMEPAGE_UNAVAILABLE',
        message: 'صفحه اصلی در حال حاضر در دسترس نیست.',
      });
    }
    const cacheKey = `${publication.id}:v${publication.version}:s${snapshot.schemaVersion}`;
    const cached = this.cache.get<PublishedHomepageDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const validation = validateHomepageSnapshot(snapshot);
    if (!validation.valid || snapshot.schemaVersion !== publication.schemaVersion) {
      this.logger.error(
        `Invalid PUBLISHED homepage publication id=${publication.id} version=${publication.version} schema=${snapshot.schemaVersion}: ${validation.errors
          .map((error) => `${error.path}:${error.code}`)
          .join(', ')}`,
      );
      throw new ServiceUnavailableException({
        error: 'HOMEPAGE_UNAVAILABLE',
        message: 'صفحه اصلی در حال حاضر در دسترس نیست.',
      });
    }

    let sections;
    try {
      sections = await this.resolver.resolve(snapshot, now);
    } catch (error) {
      this.logger.error(
        `Homepage resolution failed id=${publication.id} version=${publication.version}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException({
        error: 'HOMEPAGE_UNAVAILABLE',
        message: 'صفحه اصلی در حال حاضر در دسترس نیست.',
      });
    }

    const payload: PublishedHomepageDto = {
      version: publication.version,
      schemaVersion: snapshot.schemaVersion,
      publishedAt: publication.publishedAt?.toISOString() ?? null,
      sections,
    };
    this.cache.set(cacheKey, payload);
    return payload;
  }
}

function readStoredSnapshot(
  value: Prisma.JsonValue,
  schemaVersion: number,
): HomepageSnapshot | null {
  if (Array.isArray(value)) {
    return {
      schemaVersion,
      sections: value as unknown as HomepageSnapshotSection[],
    };
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.sections)) return null;
    if (
      record.schemaVersion !== undefined &&
      typeof record.schemaVersion !== 'number'
    ) {
      return null;
    }
    return {
      schemaVersion:
        typeof record.schemaVersion === 'number'
          ? record.schemaVersion
          : schemaVersion,
      sections: record.sections as unknown as HomepageSnapshotSection[],
    };
  }
  return null;
}
