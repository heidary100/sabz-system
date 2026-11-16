/**
 * Operation IDs appear in the journal primary key, storage key segments and
 * backup filenames. The accepted alphabet is deliberately narrow so the value
 * cannot introduce path separators, traversal, whitespace, control characters
 * or encoding ambiguity.
 */
export const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

export function assertOperationId(value: string): string {
  if (typeof value !== 'string' || !OPERATION_ID_PATTERN.test(value)) {
    throw new Error(
      'HOMEPAGE_DEMO_OPERATION_ID must match ^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$ (no spaces, dots, slashes, control characters or path traversal).',
    );
  }
  return value;
}
