import { BadRequestException } from '@nestjs/common';
import { MERCH_HOMEPAGE_SCHEMA_VERSION } from '@sabz/types';
import {
  addIssue,
  createValidationResult,
  isRecord,
  reportUnknownKeys,
  requireInteger,
  requireRecord,
  type MerchValidationIssue,
  type MerchValidationResult,
} from '../validation';

export interface ParsedDraftWrite {
  revision: number;
  schemaVersion?: number;
  sections: unknown;
}

export interface ParsedDraftValidation {
  revision?: number;
  schemaVersion?: number;
  sections?: unknown;
}

const WRITE_KEYS = ['revision', 'schemaVersion', 'sections'] as const;

export function validateDraftWriteBody(body: unknown): {
  result: MerchValidationResult;
  value: ParsedDraftWrite | null;
} {
  const errors: MerchValidationIssue[] = [];
  const input = requireRecord(body, 'draft', errors);
  if (!input) {
    return { result: createValidationResult(errors), value: null };
  }
  reportUnknownKeys(input, WRITE_KEYS, 'draft', errors);
  const revision = requireInteger(input, 'revision', 'draft', errors, 0, 2_147_483_647);
  const schemaVersion = optionalSchemaVersion(input, errors);
  if (!Array.isArray(input.sections)) {
    addIssue(errors, 'draft.sections', 'INVALID_ARRAY', 'بخش‌های صفحه اصلی باید آرایه باشند.');
  }
  const result = createValidationResult(errors);
  return {
    result,
    value:
      result.valid && revision !== null
        ? {
            revision,
            ...(schemaVersion !== undefined ? { schemaVersion } : {}),
            sections: input.sections,
          }
        : null,
  };
}

export function validateDraftValidationBody(body: unknown): {
  result: MerchValidationResult;
  value: ParsedDraftValidation;
} {
  const errors: MerchValidationIssue[] = [];
  const value: ParsedDraftValidation = {};
  if (!isRecord(body)) {
    addIssue(errors, 'draft', 'INVALID_OBJECT', 'مقدار باید شیء باشد.');
    return { result: createValidationResult(errors), value };
  }
  reportUnknownKeys(body, WRITE_KEYS, 'draft', errors);
  if ('revision' in body) {
    const revision = requireInteger(body, 'revision', 'draft', errors, 0, 2_147_483_647);
    if (revision !== null) value.revision = revision;
  }
  const schemaVersion = optionalSchemaVersion(body, errors);
  if (schemaVersion !== undefined) value.schemaVersion = schemaVersion;
  if ('sections' in body) {
    if (!Array.isArray(body.sections)) {
      addIssue(errors, 'draft.sections', 'INVALID_ARRAY', 'بخش‌های صفحه اصلی باید آرایه باشند.');
    } else {
      value.sections = body.sections;
    }
  }
  return { result: createValidationResult(errors), value };
}

function optionalSchemaVersion(
  input: Record<string, unknown>,
  errors: MerchValidationIssue[],
): number | undefined {
  if (!('schemaVersion' in input)) return undefined;
  const value = requireInteger(input, 'schemaVersion', 'draft', errors, 1, 2_147_483_647);
  if (value !== null && value !== MERCH_HOMEPAGE_SCHEMA_VERSION) {
    addIssue(
      errors,
      'draft.schemaVersion',
      'UNSUPPORTED_SCHEMA_VERSION',
      `نسخه ساختار باید ${MERCH_HOMEPAGE_SCHEMA_VERSION} باشد.`,
    );
  }
  return value ?? undefined;
}

export function throwDraftInputError(result: MerchValidationResult): never {
  throw new BadRequestException({
    error: 'HOMEPAGE_DRAFT_INVALID_INPUT',
    message: result.errors.map((error) => error.message),
    errors: result.errors,
  });
}
