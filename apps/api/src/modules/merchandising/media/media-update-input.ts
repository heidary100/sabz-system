import { BadRequestException } from '@nestjs/common';

const ALT_MAX_LENGTH = 160;

export interface ParsedMerchMediaUpdate {
  altFa?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strict parser for the metadata-only media update endpoint.
 *
 * The controller deliberately reads a raw body so unknown/server-controlled
 * fields are rejected rather than silently whitelisted away by the global
 * ValidationPipe. This parser is the single validation boundary and rejects
 * non-record JSON values before any property access.
 */
export function parseMerchMediaUpdateBody(body: unknown): ParsedMerchMediaUpdate {
  if (!isRecord(body)) {
    throw new BadRequestException({
      error: 'MERCH_MEDIA_INVALID_INPUT',
      message: 'بدنه درخواست باید شیء باشد.',
    });
  }

  const unknownKeys = Object.keys(body).filter((key) => key !== 'altFa');
  if (unknownKeys.length > 0) {
    throw new BadRequestException({
      error: 'MERCH_MEDIA_INVALID_INPUT',
      message: `فیلدهای قابل ویرایش فقط altFa هستند؛ فیلدهای غیرمجاز: ${unknownKeys.join(', ')}`,
    });
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'altFa')) {
    return {};
  }

  const rawAlt = body.altFa;
  if (rawAlt !== null && typeof rawAlt !== 'string') {
    throw new BadRequestException({
      error: 'MERCH_MEDIA_INVALID_INPUT',
      message: 'altFa باید رشته یا null باشد.',
    });
  }
  if (typeof rawAlt === 'string' && rawAlt.length > ALT_MAX_LENGTH) {
    throw new BadRequestException({
      error: 'MERCH_MEDIA_INVALID_INPUT',
      message: `altFa باید حداکثر ${ALT_MAX_LENGTH} کاراکتر باشد.`,
    });
  }

  return {
    altFa: typeof rawAlt === 'string' ? rawAlt.trim() || null : null,
  };
}
