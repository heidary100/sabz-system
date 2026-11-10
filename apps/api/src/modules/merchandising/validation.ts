/**
 * Pure merchandising validation primitives (Task 05.1).
 *
 * JSON section/snapshot configuration is validated by an explicit registry of
 * type-specific validators rather than a generic schema engine. The functions
 * return structured, path-based issues and never coerce invalid values into
 * valid ones. Future admin forms can render the same issues.
 */

export interface MerchValidationIssue {
  /** Dotted/bracketed path, e.g. `sections[0].settings.campaignIds[1]`. */
  path: string;
  /** Stable machine-readable code for form mapping/tests. */
  code: string;
  /** Actionable Persian message. */
  message: string;
}

export interface MerchValidationResult {
  valid: boolean;
  errors: MerchValidationIssue[];
}

export function createValidationResult(
  errors: MerchValidationIssue[],
): MerchValidationResult {
  return { valid: errors.length === 0, errors };
}

export function addIssue(
  errors: MerchValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  errors.push({ path, code, message });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Generic UUID shape (the database uses UUIDs for the relevant entities). */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

export function isSafeInternalHref(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) {
    return false;
  }
  if (!value.startsWith('/') || value.startsWith('//')) {
    return false;
  }
  // Bounded internal destinations only; never arbitrary URLs/protocols.
  return /^\/(?:products|categories|blog)(?:[/?][A-Za-z0-9\-_[\]=&.%?/]*)?$/.test(
    value,
  );
}

export function reportUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  errors: MerchValidationIssue[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      addIssue(
        errors,
        `${path}.${key}`,
        'UNKNOWN_FIELD',
        'این فیلد برای این بخش مجاز نیست.',
      );
    }
  }
}

export function requireRecord(
  value: unknown,
  path: string,
  errors: MerchValidationIssue[],
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    addIssue(errors, path, 'INVALID_OBJECT', 'مقدار باید شیء باشد.');
    return null;
  }
  return value;
}

export function requireString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
  maxLength: number,
): string | null {
  const value = record[key];
  if (!isNonEmptyString(value, maxLength)) {
    addIssue(
      errors,
      `${path}.${key}`,
      'INVALID_STRING',
      `«${key}» الزامی است و باید حداکثر ${maxLength} کاراکتر باشد.`,
    );
    return null;
  }
  return value;
}

export function optionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
  maxLength: number,
): string | null {
  if (!(key in record)) {
    return null;
  }
  const value = record[key];
  if (!isNonEmptyString(value, maxLength)) {
    addIssue(
      errors,
      `${path}.${key}`,
      'INVALID_STRING',
      `«${key}» باید رشته غیرخالی و حداکثر ${maxLength} کاراکتر باشد.`,
    );
    return null;
  }
  return value;
}

/** A required key that may be an explicit null or a bounded non-empty string. */
export function nullableString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
  maxLength: number,
): string | null {
  if (!(key in record)) {
    addIssue(
      errors,
      `${path}.${key}`,
      'MISSING_FIELD',
      `«${key}» الزامی است (می‌تواند null باشد).`,
    );
    return null;
  }
  if (record[key] === null) {
    return null;
  }
  const value = record[key];
  if (!isNonEmptyString(value, maxLength)) {
    addIssue(
      errors,
      `${path}.${key}`,
      'INVALID_STRING',
      `«${key}» باید رشته غیرخالی و حداکثر ${maxLength} کاراکتر باشد یا null.`,
    );
    return null;
  }
  return value;
}

export function requireUuid(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
): string | null {
  const value = record[key];
  if (!isUuid(value)) {
    addIssue(
      errors,
      `${path}.${key}`,
      'INVALID_UUID',
      `«${key}» باید شناسه معتبر باشد.`,
    );
    return null;
  }
  return value;
}

export function optionalUuid(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
): string | null {
  if (!(key in record) || record[key] === null) {
    return null;
  }
  return requireUuid(record, key, path, errors);
}

export function requireBoolean(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
): boolean | null {
  const value = record[key];
  if (typeof value !== 'boolean') {
    addIssue(
      errors,
      `${path}.${key}`,
      'INVALID_BOOLEAN',
      `«${key}» باید مقدار بولی باشد.`,
    );
    return null;
  }
  return value;
}

export function optionalBoolean(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
): boolean | null {
  if (!(key in record)) {
    return null;
  }
  return requireBoolean(record, key, path, errors);
}

export function requireInteger(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
  min: number,
  max: number,
): number | null {
  const value = record[key];
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    addIssue(
      errors,
      `${path}.${key}`,
      'INVALID_INTEGER',
      `«${key}» باید عدد صحیح بین ${min} و ${max} باشد.`,
    );
    return null;
  }
  return value as number;
}

export function optionalInteger(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
  min: number,
  max: number,
): number | null {
  if (!(key in record)) {
    return null;
  }
  return requireInteger(record, key, path, errors, min, max);
}

export function requireArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
  min: number,
  max: number,
): unknown[] | null {
  const value = record[key];
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    addIssue(
      errors,
      `${path}.${key}`,
      'INVALID_ARRAY',
      `«${key}» باید آرایه‌ای با ${min} تا ${max} عضو باشد.`,
    );
    return null;
  }
  return value;
}

export function requireUuidArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
  min: number,
  max: number,
): string[] | null {
  const values = requireArray(record, key, path, errors, min, max);
  if (!values) {
    return null;
  }
  const unique = new Set<string>();
  const result: string[] = [];
  values.forEach((value, index) => {
    if (!isUuid(value)) {
      addIssue(
        errors,
        `${path}.${key}[${index}]`,
        'INVALID_UUID',
        `عضو ${index + 1} «${key}» باید شناسه معتبر باشد.`,
      );
      return;
    }
    if (unique.has(value)) {
      addIssue(
        errors,
        `${path}.${key}[${index}]`,
        'DUPLICATE_ID',
        `شناسه تکراری در «${key}» مجاز نیست.`,
      );
      return;
    }
    unique.add(value);
    result.push(value);
  });
  return result;
}

export function validateIsoDate(
  value: unknown,
  path: string,
  errors: MerchValidationIssue[],
  nullable: boolean,
): string | null {
  if (value === null) {
    if (nullable) {
      return null;
    }
    addIssue(errors, path, 'INVALID_DATE', 'تاریخ نمی‌تواند خالی باشد.');
    return null;
  }
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    addIssue(errors, path, 'INVALID_DATE', 'تاریخ باید ISO معتبر باشد.');
    return null;
  }
  return value;
}
