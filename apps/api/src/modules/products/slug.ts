import { randomUUID } from 'crypto';

const SLUG_MAX = 255;

/**
 * Deterministic slug generation from a name. No external library:
 * lowercase, replace runs of non-alphanumeric characters with a single
 * hyphen, trim leading/trailing hyphens, cap length. Falls back to a random
 * suffix when the sanitized name is empty.
 */
export function generateSlug(name: string, fallbackPrefix: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
  if (slug.length === 0) {
    return `${fallbackPrefix}-${randomUUID().slice(0, 8)}`;
  }
  return slug;
}
