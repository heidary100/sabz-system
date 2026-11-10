import { BadRequestException } from '@nestjs/common';
import {
  addIssue,
  createValidationResult,
  isNonEmptyString,
  reportUnknownKeys,
  requireRecord,
  type MerchValidationIssue,
  type MerchValidationResult,
  validateIsoDate,
} from '../validation';

const NOTE_MAX_LENGTH = 500;

export interface ParsedCreatePublication {
  publishAt: string | null;
  note: string | null;
}

export interface ParsedRollbackPublication {
  note: string | null;
}

export function validateCreatePublicationBody(body: unknown): {
  result: MerchValidationResult;
  value: ParsedCreatePublication | null;
} {
  const errors: MerchValidationIssue[] = [];
  const input = requireRecord(body ?? {}, 'publication', errors);
  if (!input) {
    return { result: createValidationResult(errors), value: null };
  }
  reportUnknownKeys(input, ['publishAt', 'note'], 'publication', errors);
  let publishAt: string | null = null;
  if ('publishAt' in input && input.publishAt !== null) {
    const parsed = validateIsoDate(input.publishAt, 'publication.publishAt', errors, true);
    publishAt = parsed;
  }
  const note = optionalNote(input, 'note', 'publication', errors);
  const result = createValidationResult(errors);
  return {
    result,
    value: result.valid ? { publishAt, note } : null,
  };
}

export function validateRollbackPublicationBody(body: unknown): {
  result: MerchValidationResult;
  value: ParsedRollbackPublication | null;
} {
  const errors: MerchValidationIssue[] = [];
  const input = requireRecord(body ?? {}, 'publication', errors);
  if (!input) {
    return { result: createValidationResult(errors), value: null };
  }
  reportUnknownKeys(input, ['note'], 'publication', errors);
  const note = optionalNote(input, 'note', 'publication', errors);
  const result = createValidationResult(errors);
  return { result, value: result.valid ? { note } : null };
}

function optionalNote(
  input: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
): string | null {
  if (!(key in input) || input[key] === null) return null;
  if (!isNonEmptyString(input[key], NOTE_MAX_LENGTH)) {
    addIssue(
      errors,
      `${path}.${key}`,
      'INVALID_STRING',
      `«${key}» باید رشته غیرخالی و حداکثر ${NOTE_MAX_LENGTH} کاراکتر باشد یا null.`,
    );
    return null;
  }
  return (input[key] as string).trim();
}

export function throwPublicationInputError(result: MerchValidationResult): never {
  throw new BadRequestException({
    error: 'HOMEPAGE_PUBLICATION_INVALID_INPUT',
    message: result.errors.map((error) => error.message),
    errors: result.errors,
  });
}
