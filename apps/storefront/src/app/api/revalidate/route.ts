import { createHash, timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import type { NextRequest } from 'next/server';
import { isAllowedCatalogTag } from '@/lib/cache-tags';

/**
 * Secured cache invalidation endpoint (SS-217).
 *
 * The API calls this after a committed catalog mutation so the storefront
 * Data Cache drops the affected entries immediately; the per-entry revalidate
 * windows are only safety nets. Tags are allow-listed (`isAllowedCatalogTag`)
 * and the token is compared in constant time (both sides hashed first, so
 * length never leaks and lengths always match).
 *
 * Failure behavior: authenticated malformed requests get 400; bad/missing
 * tokens get 401; an unset REVALIDATE_TOKEN disables the endpoint (503) —
 * invalidation is best-effort end-to-end and must never be a public write.
 */

function tokenMatches(provided: string, expected: string): boolean {
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export async function POST(request: NextRequest): Promise<Response> {
  const expected = process.env.REVALIDATE_TOKEN;
  if (!expected) {
    return new Response(null, { status: 503 });
  }

  const provided = request.headers.get('x-revalidate-token') ?? '';
  if (!tokenMatches(provided, expected)) {
    return new Response(null, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const tags = (body as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(tags) || tags.length === 0 || tags.length > 64) {
    return new Response(null, { status: 400 });
  }
  if (!tags.every((tag) => isAllowedCatalogTag(tag))) {
    return new Response(null, { status: 400 });
  }

  for (const tag of new Set(tags)) {
    // Next 16: revalidateTag requires a cache-life profile; `expire: 0`
    // expires the tagged entries immediately.
    revalidateTag(tag, { expire: 0 });
  }
  return new Response(null, { status: 204 });
}
