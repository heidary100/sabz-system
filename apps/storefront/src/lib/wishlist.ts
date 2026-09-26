import type { WishlistItemDto } from '@sabz/types';
import { ApiError } from '@/lib/api';
import { authFetch } from '@/lib/auth-client';

/**
 * Customer wishlist client (SS-231): thin browser boundary over
 * `/wishlist`. All calls go through `authFetch` (Bearer + httpOnly refresh
 * cookie); responses are never cached — wishlist state is per-user and
 * client-fresh by contract. Pure helpers stay exported for vitest.
 */

const LIST_FAILED = 'دریافت علاقه‌مندی‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SAVE_FAILED = 'افزودن به علاقه‌مندی‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const REMOVE_FAILED = 'حذف از علاقه‌مندی‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SESSION_EXPIRED = 'نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید';

function unauthorized(): ApiError {
  return new ApiError(401, {
    statusCode: 401,
    message: SESSION_EXPIRED,
    error: 'Unauthorized',
  });
}

interface ApiErrorBody {
  message?: unknown;
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const body = (await response.json().catch(() => undefined)) as
    | ApiErrorBody
    | undefined;
  const message =
    typeof body?.message === 'string' && body.message !== ''
      ? body.message
      : fallback;
  throw new ApiError(response.status, {
    statusCode: response.status,
    message,
    error: fallback,
  });
}

/** True when the product id is in the given wishlist-id set. */
export function isWishlisted(ids: ReadonlySet<string>, productId: string): boolean {
  return ids.has(productId);
}

/** Pure immutable toggle for optimistic wishlist-id sets. */
export function toggleWishlistIds(
  ids: ReadonlySet<string>,
  productId: string,
): Set<string> {
  const next = new Set(ids);
  if (next.has(productId)) {
    next.delete(productId);
  } else {
    next.add(productId);
  }
  return next;
}

/**
 * Validates the `GET /wishlist` payload shape before anything renders, so a
 * backend regression can never plant a half-broken list.
 */
export function parseWishlistList(payload: unknown): WishlistItemDto[] {
  const body = payload as { items?: unknown; total?: unknown } | null;
  if (!Array.isArray(body?.items) || typeof body?.total !== 'number') {
    throw new Error(LIST_FAILED);
  }
  return body.items as WishlistItemDto[];
}

async function authedJson(path: string, init: RequestInit, fallback: string): Promise<Response> {
  let response: Response;
  try {
    response = await authFetch(path, { ...init, cache: 'no-store' });
  } catch (error) {
    // authFetch throws the raw 401 Response when the refresh fails.
    if (error instanceof Response && error.status === 401) {
      throw unauthorized();
    }
    throw error;
  }
  if (response.status === 401) {
    throw unauthorized();
  }
  if (!response.ok) {
    await throwApiError(response, fallback);
  }
  return response;
}

/** Saved products, newest first; throws ApiError(401) when the session is dead. */
export async function fetchWishlist(): Promise<WishlistItemDto[]> {
  const response = await authedJson('/wishlist', {}, LIST_FAILED);
  return parseWishlistList(await response.json().catch(() => undefined));
}

/** Idempotent save (201 new, 200 already saved) — returns the wishlist row. */
export async function addToWishlist(productId: string): Promise<WishlistItemDto> {
  const response = await authedJson(
    '/wishlist',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId }),
    },
    SAVE_FAILED,
  );
  return (await response.json()) as WishlistItemDto;
}

/** Idempotent removal — resolves true when a row was actually deleted. */
export async function removeFromWishlist(productId: string): Promise<boolean> {
  const response = await authedJson(
    `/wishlist/${encodeURIComponent(productId)}`,
    { method: 'DELETE' },
    REMOVE_FAILED,
  );
  const body = (await response.json().catch(() => undefined)) as {
    removed?: unknown;
  } | undefined;
  return body?.removed === true;
}
