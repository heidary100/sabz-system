/**
 * Client-side product compare list (SS-237).
 *
 * The compare list is guest-friendly local state: no backend model, no auth.
 * Entries carry `{ id, slug }` only — never prices (the catalog DTO resolved
 * server-side is the single price truth). Persistence is a `localStorage`
 * boundary mirroring the guest-cart conventions in `lib/cart.ts`; pure
 * helpers stay exported for vitest.
 */

export const COMPARE_MAX_ITEMS = 4;

export const COMPARE_FULL_MESSAGE =
  'فهرست مقایسه پر است؛ برای افزودن محصول جدید ابتدا یکی را حذف کنید.';

export interface CompareEntry {
  id: string;
  slug: string;
}

export type CompareToggleResult =
  | { entries: CompareEntry[]; added: boolean }
  | { entries: CompareEntry[]; added: false; full: true };

const COMPARE_STORAGE_KEY = 'sabz.compare.v1';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

function isValidEntry(entry: unknown): entry is CompareEntry {
  const candidate = entry as { id?: unknown; slug?: unknown } | null;
  return (
    typeof candidate?.id === 'string' &&
    UUID_PATTERN.test(candidate.id) &&
    typeof candidate?.slug === 'string' &&
    candidate.slug.length > 0 &&
    candidate.slug.length <= 200 &&
    SLUG_PATTERN.test(candidate.slug)
  );
}

/**
 * Validates a compare-list payload shape; anything else becomes [].
 * Dedupes by product id preserving first-seen order and caps at 4.
 */
export function parseCompareList(payload: unknown): CompareEntry[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  const entries: CompareEntry[] = [];
  for (const item of payload) {
    if (!isValidEntry(item)) {
      continue;
    }
    if (entries.some((row) => row.id === item.id)) {
      continue;
    }
    entries.push({ id: item.id, slug: item.slug });
    if (entries.length >= COMPARE_MAX_ITEMS) {
      break;
    }
  }
  return entries;
}

/** True when the product id is in the compare list. */
export function isCompared(
  entries: readonly CompareEntry[],
  productId: string,
): boolean {
  return entries.some((row) => row.id === productId);
}

/**
 * Immutable toggle: removes when present, appends when there is room,
 * reports `full` when the 4-slot list is already full.
 */
export function toggleCompareList(
  entries: readonly CompareEntry[],
  entry: CompareEntry,
): CompareToggleResult {
  if (!isValidEntry(entry)) {
    return { entries: entries.map((row) => ({ ...row })), added: false };
  }
  if (isCompared(entries, entry.id)) {
    return {
      entries: entries.filter((row) => row.id !== entry.id),
      added: false,
    };
  }
  if (entries.length >= COMPARE_MAX_ITEMS) {
    return {
      entries: entries.map((row) => ({ ...row })),
      added: false,
      full: true,
    };
  }
  return { entries: [...entries, { ...entry }], added: true };
}

/** Immutable removal by product id. */
export function removeCompareEntry(
  entries: readonly CompareEntry[],
  productId: string,
): CompareEntry[] {
  return entries
    .filter((row) => row.id !== productId)
    .map((row) => ({ ...row }));
}

/** Slugs in list order — the shareable `/compare?products=` identity. */
export function compareSlugs(entries: readonly CompareEntry[]): string[] {
  return entries.map((row) => row.slug);
}

/**
 * Parses the `products` query value (comma-separated slugs); anything
 * invalid is dropped, deduped, and capped at 4.
 */
export function parseSlugsParam(value: unknown): string[] {
  const raw =
    typeof value === 'string' ? value : Array.isArray(value) ? value[0] : null;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return [];
  }
  const slugs: string[] = [];
  for (const part of raw.split(',')) {
    const slug = part.trim().toLowerCase();
    if (
      slug === '' ||
      slug.length > 200 ||
      !SLUG_PATTERN.test(slug) ||
      slugs.includes(slug)
    ) {
      continue;
    }
    slugs.push(slug);
    if (slugs.length >= COMPARE_MAX_ITEMS) {
      break;
    }
  }
  return slugs;
}

/** Shareable compare URL for the given slugs (empty list → bare route). */
export function buildCompareHref(slugs: readonly string[]): string {
  if (slugs.length === 0) {
    return '/compare';
  }
  return `/compare?products=${slugs.map(encodeURIComponent).join(',')}`;
}

export function loadCompareList(): CompareEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(COMPARE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return parseCompareList(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function saveCompareList(entries: readonly CompareEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(COMPARE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable (private mode): the compare list simply
    // does not persist — never crash the shopping surface over it.
  }
}
