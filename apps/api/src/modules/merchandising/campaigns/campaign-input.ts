import { BadRequestException } from '@nestjs/common';
import { MERCH_CAMPAIGN_TYPES } from '@sabz/types';
import { validateCampaignCta, validateCampaignSelectionLimits } from '../campaign-validation';
import {
  addIssue,
  createValidationResult,
  isNonEmptyString,
  reportUnknownKeys,
  requireInteger,
  requireRecord,
  type MerchValidationIssue,
  type MerchValidationResult,
  validateIsoDate,
} from '../validation';

const CAMPAIGN_TYPES = new Set<string>(MERCH_CAMPAIGN_TYPES);
const CREATE_KEYS = [
  'internalName',
  'type',
  'titleFa',
  'eyebrowFa',
  'subtitleFa',
  'descriptionFa',
  'ctaLabelFa',
  'cta',
  'isEnabled',
  'startsAt',
  'endsAt',
  'priority',
  'productIds',
  'categoryIds',
  'brandIds',
  'media',
] as const;

const TEXT_LIMITS = {
  internalName: 255,
  titleFa: 200,
  eyebrowFa: 120,
  subtitleFa: 300,
  descriptionFa: 1000,
  ctaLabelFa: 120,
} as const;

/**
 * Strict raw-body validation for campaign create/update (Task 05.3).
 *
 * The global ValidationPipe whitelists unknown properties; campaign inputs are
 * therefore read raw and validated here so server-controlled fields and
 * unknown properties are rejected rather than silently discarded.
 */
export function validateCampaignInput(
  body: unknown,
  mode: 'create' | 'update',
): MerchValidationResult {
  const errors: MerchValidationIssue[] = [];
  const input = requireRecord(body, 'campaign', errors);
  if (!input) {
    return createValidationResult(errors);
  }
  reportUnknownKeys(input, CREATE_KEYS, 'campaign', errors);

  if (mode === 'update' && Object.keys(input).length === 0) {
    addIssue(
      errors,
      'campaign',
      'EMPTY_UPDATE',
      'حداقل یک فیلد برای به‌روزرسانی لازم است.',
    );
  }

  if (mode === 'create') {
    requiredText(input, 'internalName', errors);
    requiredText(input, 'type', errors, 20);
    requiredText(input, 'titleFa', errors);
  }

  if ('type' in input && (typeof input.type !== 'string' || !CAMPAIGN_TYPES.has(input.type))) {
    addIssue(
      errors,
      'campaign.type',
      'INVALID_CAMPAIGN_TYPE',
      'نوع کمپین معتبر نیست.',
    );
  }
  if ('internalName' in input) {
    textField(input, 'internalName', errors);
  }
  if ('titleFa' in input) {
    textField(input, 'titleFa', errors);
  }
  for (const key of ['eyebrowFa', 'subtitleFa', 'descriptionFa', 'ctaLabelFa'] as const) {
    if (key in input) {
      nullableTextField(input, key, errors);
    }
  }

  if ('cta' in input) {
    const cta = validateCampaignCta(input.cta);
    errors.push(
      ...cta.errors.map((error) => ({
        ...error,
        path: `campaign.${error.path}`,
      })),
    );
  }

  if ('isEnabled' in input && typeof input.isEnabled !== 'boolean') {
    addIssue(errors, 'campaign.isEnabled', 'INVALID_BOOLEAN', 'isEnabled باید بولی باشد.');
  }
  if ('startsAt' in input) {
    validateIsoDate(input.startsAt, 'campaign.startsAt', errors, true);
  }
  if ('endsAt' in input) {
    validateIsoDate(input.endsAt, 'campaign.endsAt', errors, true);
  }
  if ('priority' in input) {
    requireInteger(input, 'priority', 'campaign', errors, 0, 1_000_000);
  }

  const selection: Record<string, unknown> = {};
  for (const key of ['productIds', 'categoryIds', 'brandIds', 'media'] as const) {
    if (key in input) {
      selection[key] = input[key];
    }
  }
  if (Object.keys(selection).length > 0) {
    const selectionResult = validateCampaignSelectionLimits(selection);
    errors.push(
      ...selectionResult.errors.map((error) => ({
        ...error,
        path: `campaign.${error.path}`,
      })),
    );
  }

  return createValidationResult(errors);
}

function requiredText(
  input: Record<string, unknown>,
  key: keyof typeof TEXT_LIMITS | 'type',
  errors: MerchValidationIssue[],
  max: number = TEXT_LIMITS[key as keyof typeof TEXT_LIMITS] ?? 255,
): void {
  const value = input[key];
  if (!isNonEmptyString(value, max)) {
    addIssue(
      errors,
      `campaign.${key}`,
      'INVALID_STRING',
      `«${key}» الزامی است و باید حداکثر ${max} کاراکتر باشد.`,
    );
  }
}

function textField(
  input: Record<string, unknown>,
  key: keyof typeof TEXT_LIMITS,
  errors: MerchValidationIssue[],
): void {
  const value = input[key];
  if (!isNonEmptyString(value, TEXT_LIMITS[key])) {
    addIssue(
      errors,
      `campaign.${key}`,
      'INVALID_STRING',
      `«${key}» باید رشته غیرخالی و حداکثر ${TEXT_LIMITS[key]} کاراکتر باشد.`,
    );
  }
}

function nullableTextField(
  input: Record<string, unknown>,
  key: keyof typeof TEXT_LIMITS,
  errors: MerchValidationIssue[],
): void {
  const value = input[key];
  if (value === null) {
    return;
  }
  if (!isNonEmptyString(value, TEXT_LIMITS[key])) {
    addIssue(
      errors,
      `campaign.${key}`,
      'INVALID_STRING',
      `«${key}» باید رشته غیرخالی و حداکثر ${TEXT_LIMITS[key]} کاراکتر باشد یا null.`,
    );
  }
}

export function throwCampaignInputError(result: MerchValidationResult): never {
  throw new BadRequestException({
    message: result.errors.map((error) => error.message),
    errors: result.errors,
  });
}
