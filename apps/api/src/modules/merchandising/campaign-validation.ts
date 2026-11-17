import {
  MERCH_CAMPAIGN_MAX_BRANDS,
  MERCH_CAMPAIGN_MAX_CATEGORIES,
  MERCH_CAMPAIGN_MAX_MEDIA,
  MERCH_CAMPAIGN_MAX_PRODUCTS,
  MERCH_MEDIA_SLOTS,
  type MerchMediaSlot,
} from '@sabz/types';
import {
  addIssue,
  createValidationResult,
  isUuid,
  optionalBoolean,
  optionalInteger,
  optionalString,
  reportUnknownKeys,
  requireInteger,
  requireRecord,
  requireUuid,
  type MerchValidationIssue,
  type MerchValidationResult,
  validateIsoDate,
} from './validation';

/**
 * Campaign foundation validation (Task 05.1).
 *
 * Entity existence/visibility and product publication state are resolved by
 * the future campaign service; this module owns only the stable date-window,
 * CTA-shape, and selection-limit rules that can be tested in isolation.
 */

export function validateCampaignWindow(
  startsAt: unknown,
  endsAt: unknown,
): MerchValidationResult {
  const errors: MerchValidationIssue[] = [];
  const start =
    startsAt === undefined || startsAt === null
      ? null
      : validateIsoDate(startsAt, 'startsAt', errors, true);
  const end =
    endsAt === undefined || endsAt === null
      ? null
      : validateIsoDate(endsAt, 'endsAt', errors, true);
  if (start && end && Date.parse(end) <= Date.parse(start)) {
    addIssue(
      errors,
      'endsAt',
      'INVALID_WINDOW',
      'تاریخ پایان باید بعد از تاریخ شروع باشد.',
    );
  }
  return createValidationResult(errors);
}

/** Count/ID/media validation for campaign editor payloads (entity checks later). */
export function validateCampaignSelectionLimits(
  input: unknown,
): MerchValidationResult {
  const errors: MerchValidationIssue[] = [];
  const selection = requireRecord(input, 'selection', errors);
  if (!selection) {
    return createValidationResult(errors);
  }
  reportUnknownKeys(
    selection,
    ['productIds', 'categoryIds', 'brandIds', 'media'],
    'selection',
    errors,
  );

  validateIdCollection(selection, 'productIds', MERCH_CAMPAIGN_MAX_PRODUCTS, errors);
  validateIdCollection(selection, 'categoryIds', MERCH_CAMPAIGN_MAX_CATEGORIES, errors);
  validateIdCollection(selection, 'brandIds', MERCH_CAMPAIGN_MAX_BRANDS, errors);
  validateCampaignMedia(selection, errors);
  return createValidationResult(errors);
}

function validateIdCollection(
  selection: Record<string, unknown>,
  key: 'productIds' | 'categoryIds' | 'brandIds',
  max: number,
  errors: MerchValidationIssue[],
): void {
  if (!(key in selection)) {
    return;
  }
  const values = selection[key];
  if (!Array.isArray(values)) {
    addIssue(
      errors,
      `selection.${key}`,
      'INVALID_ARRAY',
      'مقدار انتخاب‌ها باید آرایه باشد.',
    );
    return;
  }
  if (values.length > max) {
    addIssue(
      errors,
      `selection.${key}`,
      'SELECTION_LIMIT',
      `حداکثر ${max} انتخاب در «${key}» مجاز است.`,
    );
  }
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!isUuid(value)) {
      addIssue(
        errors,
        `selection.${key}[${index}]`,
        'INVALID_UUID',
        'شناسه انتخاب‌شده معتبر نیست.',
      );
      return;
    }
    if (seen.has(value)) {
      addIssue(
        errors,
        `selection.${key}[${index}]`,
        'DUPLICATE_ID',
        'شناسه تکراری در انتخاب‌ها مجاز نیست.',
      );
      return;
    }
    seen.add(value);
  });
}

function validateCampaignMedia(
  selection: Record<string, unknown>,
  errors: MerchValidationIssue[],
): void {
  if (!('media' in selection)) {
    return;
  }
  const media = selection.media;
  if (!Array.isArray(media)) {
    addIssue(errors, 'selection.media', 'INVALID_ARRAY', 'رسانه‌ها باید آرایه باشند.');
    return;
  }
  if (media.length > MERCH_CAMPAIGN_MAX_MEDIA) {
    addIssue(
      errors,
      'selection.media',
      'MEDIA_LIMIT',
      `حداکثر ${MERCH_CAMPAIGN_MAX_MEDIA} رسانه برای هر کمپین مجاز است.`,
    );
  }
  const seen = new Set<string>();
  const slots = new Set<string>(MERCH_MEDIA_SLOTS);
  media.forEach((raw, index) => {
    const path = `selection.media[${index}]`;
    const item = requireRecord(raw, path, errors);
    if (!item) {
      return;
    }
    reportUnknownKeys(
      item,
      ['mediaId', 'slot', 'focalX', 'focalY', 'altFa'],
      path,
      errors,
    );
    const mediaId = requireUuid(item, 'mediaId', path, errors);
    const slot = item.slot;
    if (typeof slot !== 'string' || !slots.has(slot)) {
      addIssue(errors, `${path}.slot`, 'INVALID_MEDIA_SLOT', 'جایگاه رسانه معتبر نیست.');
    } else if (mediaId) {
      const key = `${mediaId}:${slot}`;
      if (seen.has(key)) {
        addIssue(
          errors,
          `${path}.slot`,
          'DUPLICATE_MEDIA_SLOT',
          'رسانه در این جایگاه قبلاً انتخاب شده است.',
        );
      }
      seen.add(key);
    }
    optionalInteger(item, 'focalX', path, errors, 0, 100);
    optionalInteger(item, 'focalY', path, errors, 0, 100);
    if ('altFa' in item && item.altFa !== null) {
      optionalString(item, 'altFa', path, errors, 160);
    }
  });
}

/**
 * Validate the CTA target shape. The database also enforces this invariant;
 * this function gives admin forms actionable path-based errors.
 */
export function validateCampaignCta(input: unknown): MerchValidationResult {
  const errors: MerchValidationIssue[] = [];
  const cta = requireRecord(input, 'cta', errors);
  if (!cta) {
    return createValidationResult(errors);
  }
  switch (cta.kind) {
    case 'NONE':
    case 'ALL_PRODUCTS':
    case 'NEW_ARRIVALS':
      reportUnknownKeys(cta, ['kind', 'productId', 'categoryId', 'brandId'], 'cta', errors);
      for (const key of ['productId', 'categoryId', 'brandId'] as const) {
        if (key in cta && cta[key] !== null && cta[key] !== undefined) {
          addIssue(
            errors,
            `cta.${key}`,
            'INVALID_CTA_TARGET',
            'برای این نوع مقصد، شناسه نباید تعیین شود.',
          );
        }
      }
      return createValidationResult(errors);
    case 'PRODUCT':
      reportUnknownKeys(cta, ['kind', 'productId'], 'cta', errors);
      requireUuid(cta, 'productId', 'cta', errors);
      return createValidationResult(errors);
    case 'CATEGORY':
      reportUnknownKeys(cta, ['kind', 'categoryId'], 'cta', errors);
      requireUuid(cta, 'categoryId', 'cta', errors);
      return createValidationResult(errors);
    case 'BRAND':
      reportUnknownKeys(cta, ['kind', 'brandId'], 'cta', errors);
      requireUuid(cta, 'brandId', 'cta', errors);
      return createValidationResult(errors);
    default:
      addIssue(
        errors,
        'cta.kind',
        'INVALID_CTA_KIND',
        'نوع مقصد فراخوانی معتبر نیست.',
      );
      return createValidationResult(errors);
  }
}

/** Validate the campaign schedule/enabled/priority fields. */
export function validateCampaignSchedule(input: unknown): MerchValidationResult {
  const errors: MerchValidationIssue[] = [];
  const schedule = requireRecord(input, 'schedule', errors);
  if (!schedule) {
    return createValidationResult(errors);
  }
  reportUnknownKeys(
    schedule,
    ['startsAt', 'endsAt', 'isEnabled', 'priority'],
    'schedule',
    errors,
  );
  errors.push(...validateCampaignWindow(schedule.startsAt, schedule.endsAt).errors);
  optionalBoolean(schedule, 'isEnabled', 'schedule', errors);
  if ('priority' in schedule) {
    requireInteger(schedule, 'priority', 'schedule', errors, 0, 1_000_000);
  }
  return createValidationResult(errors);
}

/** Bounded slot type guard used by the future campaign service. */
export function isMerchMediaSlot(value: unknown): value is MerchMediaSlot {
  return typeof value === 'string' && (MERCH_MEDIA_SLOTS as readonly string[]).includes(value);
}
