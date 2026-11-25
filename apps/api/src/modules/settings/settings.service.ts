import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  FooterSettings,
  FooterSettingsResponse,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { SITE_FOOTER_TAG } from '../../common/storefront-cache/catalog-tags';
import { StorefrontCacheService } from '../../common/storefront-cache/storefront-cache.service';
import { AuditService } from '../audit/audit.service';
import type { FooterLinkDto, FooterSettingsDto } from './dto/footer.dto';
import { DEFAULT_FOOTER } from './footer-defaults';

const FOOTER_KEY = 'footer';

/**
 * Admin-managed storefront footer (SS-900). Only validated, non-HTML JSON is
 * stored. An absent row means "use the storefront's verified defaults" — this
 * service never invents contact details or legal claims.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: StorefrontCacheService,
  ) {}

  async getFooter(): Promise<FooterSettingsResponse> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: FOOTER_KEY },
    });
    if (!row) {
      return {
        value: DEFAULT_FOOTER,
        updatedAt: null,
        updatedBy: null,
        version: 0,
      };
    }
    const value = this.parseFooter(row.value);
    return {
      value,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
      version: row.version,
    };
  }

  async updateFooter(
    input: { value: FooterSettingsDto; version: number },
    userId: string,
    ipAddress?: string,
  ): Promise<FooterSettingsResponse> {
    const value = normalizeFooter(input.value);
    const existing = await this.prisma.siteSetting.findUnique({
      where: { key: FOOTER_KEY },
      select: { version: true, value: true },
    });
    if (!existing) {
      if (input.version !== 0) {
        throw new ConflictException(
          'نسخه تنظیمات تغییر کرده است؛ صفحه را تازه کنید.',
        );
      }
      try {
        await this.prisma.siteSetting.create({
          data: {
            key: FOOTER_KEY,
            value: value as unknown as Prisma.InputJsonValue,
            version: 1,
            updatedBy: userId,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            'تنظیمات پاورقی هم‌زمان تغییر کرده است؛ دوباره تلاش کنید.',
          );
        }
        throw error;
      }
    } else {
      if (existing.version !== input.version) {
        throw new ConflictException(
          'نسخه تنظیمات تغییر کرده است؛ صفحه را تازه کنید.',
        );
      }
      const result = await this.prisma.siteSetting.updateMany({
        where: { key: FOOTER_KEY, version: input.version },
        data: {
          value: value as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
          updatedBy: userId,
        },
      });
      if (result.count === 0) {
        throw new ConflictException(
          'تنظیمات پاورقی هم‌زمان تغییر کرده است؛ دوباره تلاش کنید.',
        );
      }
    }
    await this.audit.log({
      userId,
      action: 'SITE_FOOTER_UPDATED',
      entity: 'SiteSetting',
      entityId: FOOTER_KEY,
      before: existing ? { version: existing.version } : null,
      after: { version: input.version + 1 },
      ipAddress,
    });
    void this.cache.invalidate([SITE_FOOTER_TAG]);
    return this.getFooter();
  }

  private parseFooter(value: Prisma.JsonValue): FooterSettings {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return DEFAULT_FOOTER;
      }
      return normalizeFooter(value as unknown as FooterSettingsDto);
    } catch (error) {
      this.logger.warn(
        `Stored footer setting is invalid; using defaults: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return DEFAULT_FOOTER;
    }
  }
}

function normalizeFooter(input: FooterSettingsDto): FooterSettings {
  return {
    enabled: input.enabled !== false,
    blurb: cleanText(input.blurb, 1000),
    columns: (input.columns ?? []).map((column) => ({
      title: requireText(column.title, 120),
      links: (column.links ?? []).map((link) => normalizeLink(link)),
    })),
    contact: {
      address: cleanText(input.contact?.address, 500),
      phone: cleanText(input.contact?.phone, 100),
      email: cleanText(input.contact?.email, 200),
      hours: cleanText(input.contact?.hours, 200),
    },
    socials: (input.socials ?? []).map((link) => normalizeLink(link)),
    legalLinks: (input.legalLinks ?? []).map((link) => normalizeLink(link)),
    copyright: cleanText(input.copyright, 300),
  };
}

function normalizeLink(link: FooterLinkDto, allowRelativeOnly = false): {
  label: string;
  href: string;
  external?: boolean;
} {
  const href = link.href.trim();
  const relative = /^\/[^\s]*$/.test(href) && !href.startsWith('//');
  const https = /^https:\/\/[^\s]+$/i.test(href);
  if (allowRelativeOnly ? !relative : !(relative || https)) {
    throw new ConflictException(
      'پیوند پاورقی باید نسبی (با /) یا https باشد.',
    );
  }
  return {
    label: requireText(link.label, 120),
    href,
    ...(link.external === true || https ? { external: true } : {}),
  };
}

function requireText(value: unknown, max: number): string {
  if (typeof value !== 'string') {
    throw new ConflictException('متن پاورقی معتبر نیست.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) {
    throw new ConflictException('متن پاورقی معتبر نیست.');
  }
  return trimmed;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > max) {
    throw new ConflictException('متن پاورقی بیش از حد مجاز است.');
  }
  return trimmed;
}
