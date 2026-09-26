import type { ApiErrorPayload, CartItemDto, CartResponse } from '@sabz/types';
import { ApiError } from '@/lib/api';
import { authFetch, hasSession } from '@/lib/auth-client';

/**
 * Customer cart client (SS-232): thin browser boundary over `/cart` plus the
 * guest cart (localStorage) that merges into the server cart after login.
 *
 * Authed calls go through `authFetch` (Bearer + httpOnly refresh cookie);
 * responses are never cached — cart state is per-user and client-fresh by
 * contract. Guest lines carry variantId + quantity ONLY: prices are never
 * stored or computed client-side (CART-003/004 — the server is the only
 * price truth). Pure helpers stay exported for vitest.
 */

const LIST_FAILED = 'دریافت سبد خرید ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const ADD_FAILED = 'افزودن به سبد خرید ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const UPDATE_FAILED = 'تغییر تعداد ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const REMOVE_FAILED = 'حذف از سبد خرید ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const CLEAR_FAILED = 'پاک کردن سبد خرید ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SESSION_EXPIRED = 'نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید';

/** Client-side mirror of the API 1..99 line bound (server re-validates). */
export const CART_MAX_QUANTITY = 99;

export interface GuestCartLine {
  /** Concrete variant (detail panel adds). Exactly one identity is set. */
  variantId?: string;
  /** Quick-add product (card slot adds); resolved server-side at merge. */
  productId?: string;
  quantity: number;
}

/** Add identity: a concrete variant, or a product to quick-add. */
export interface CartAddInput {
  variantId?: string;
  productId?: string;
}

export interface MergeFailure {
  variantId: string;
  message: string;
}

export interface MergeResult {
  merged: number;
  failed: MergeFailure[];
}

const GUEST_CART_KEY = 'sabz.guestCart.v1';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unauthorized(): ApiError {
  return new ApiError(401, {
    statusCode: 401,
    message: SESSION_EXPIRED,
    error: 'Unauthorized',
  });
}

interface ApiErrorBody {
  message?: unknown;
  available?: unknown;
}

/** ApiError payload extended with the 409 stock signal (extra keys survive). */
interface StockErrorPayload extends ApiErrorPayload {
  available?: number;
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const body = (await response.json().catch(() => undefined)) as
    | ApiErrorBody
    | undefined;
  const message =
    typeof body?.message === 'string' && body.message !== ''
      ? body.message
      : fallback;
  const payload: StockErrorPayload = {
    statusCode: response.status,
    message,
    error: fallback,
  };
  if (typeof body?.available === 'number') {
    payload.available = body.available;
  }
  throw new ApiError(response.status, payload);
}

/**
 * Extracts the stock signal from a failed add/update: the Persian message
 * plus the available count when the server sent one (409).
 */
export function cartStockError(error: unknown): {
  message: string;
  available: number | null;
} {
  if (error instanceof ApiError) {
    const available = (error.payload as StockErrorPayload | undefined)
      ?.available;
    return {
      message: error.payload?.message ?? ADD_FAILED,
      available: typeof available === 'number' ? available : null,
    };
  }
  return { message: ADD_FAILED, available: null };
}

/** True when a stored session token exists (client only). */
export function isCartAuthed(): boolean {
  return hasSession();
}

/* ------------------------------------------------------------------ */
/* Guest cart: pure helpers (framework-free, vitest-covered)           */
/* ------------------------------------------------------------------ */

/** Clamps a quantity to the 1..99 line bound; non-finite input becomes 1. */
export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(CART_MAX_QUANTITY, Math.max(1, Math.floor(value)));
}

/** Validates a guest-cart payload shape; anything else becomes []. */
export function parseGuestCart(payload: unknown): GuestCartLine[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  const lines: GuestCartLine[] = [];
  for (const entry of payload) {
    const line = entry as {
      variantId?: unknown;
      productId?: unknown;
      quantity?: unknown;
    } | null;
    const variantId =
      typeof line?.variantId === 'string' && UUID_PATTERN.test(line.variantId)
        ? line.variantId
        : undefined;
    const productId =
      typeof line?.productId === 'string' && UUID_PATTERN.test(line.productId)
        ? line.productId
        : undefined;
    if ((!variantId && !productId) || typeof line?.quantity !== 'number') {
      continue;
    }
    const quantity = clampQuantity(line.quantity);
    const existing = lines.find(
      (row) =>
        (row.variantId ?? '') === (variantId ?? '') &&
        (row.productId ?? '') === (productId ?? ''),
    );
    if (existing) {
      existing.quantity = clampQuantity(existing.quantity + quantity);
    } else {
      lines.push({ ...(variantId ? { variantId } : {}), ...(productId ? { productId } : {}), quantity });
    }
  }
  return lines;
}

/** True when the line carries the given variant or product identity. */
export function matchesGuestLine(line: GuestCartLine, key: string): boolean {
  return line.variantId === key || line.productId === key;
}

/** Immutable add (increments when the identity is already present). */
export function addGuestLine(
  lines: readonly GuestCartLine[],
  identity: CartAddInput,
  quantity: number,
): GuestCartLine[] {
  const next = lines.map((line) => ({ ...line }));
  const existing = next.find(
    (line) =>
      (line.variantId ?? null) === (identity.variantId ?? null) &&
      (line.productId ?? null) === (identity.productId ?? null),
  );
  if (existing) {
    existing.quantity = clampQuantity(existing.quantity + quantity);
  } else {
    next.push({ ...identity, quantity: clampQuantity(quantity) });
  }
  return next;
}

/** Immutable absolute quantity set (matches either identity field). */
export function setGuestQuantity(
  lines: readonly GuestCartLine[],
  key: string,
  quantity: number,
): GuestCartLine[] {
  return lines.map((line) =>
    matchesGuestLine(line, key)
      ? { ...line, quantity: clampQuantity(quantity) }
      : { ...line },
  );
}

/** Immutable removal (matches either identity field). */
export function removeGuestLine(
  lines: readonly GuestCartLine[],
  key: string,
): GuestCartLine[] {
  return lines.filter((line) => !matchesGuestLine(line, key));
}

/** Total units across guest lines (the honest logged-out header count). */
export function guestCount(lines: readonly GuestCartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

/* ------------------------------------------------------------------ */
/* Guest cart: localStorage boundary                                    */
/* ------------------------------------------------------------------ */

export function loadGuestCart(): GuestCartLine[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(GUEST_CART_KEY);
    if (!raw) {
      return [];
    }
    return parseGuestCart(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function saveGuestCart(lines: readonly GuestCartLine[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (lines.length === 0) {
      window.localStorage.removeItem(GUEST_CART_KEY);
      return;
    }
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(lines));
  } catch {
    // Storage full or unavailable (private mode): the guest cart simply
    // does not persist — never crash the shopping surface over it.
  }
}

/* ------------------------------------------------------------------ */
/* Server cart: authed boundary                                         */
/* ------------------------------------------------------------------ */

/**
 * Validates the `GET /cart` payload shape before anything renders, so a
 * backend regression can never plant a half-broken cart.
 */
export function parseCartResponse(payload: unknown): CartResponse {
  const body = payload as {
    items?: unknown;
    totalQuantity?: unknown;
    subtotal?: unknown;
  } | null;
  if (
    !Array.isArray(body?.items) ||
    typeof body?.totalQuantity !== 'number' ||
    typeof body?.subtotal !== 'string'
  ) {
    throw new Error(LIST_FAILED);
  }
  return {
    items: body.items as CartItemDto[],
    totalQuantity: body.totalQuantity,
    subtotal: body.subtotal,
  };
}

async function authedJson(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<Response> {
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

async function readCart(response: Response): Promise<CartResponse> {
  return parseCartResponse(await response.json().catch(() => undefined));
}

/** Server cart; throws ApiError(401) when the session is dead. */
export async function fetchCart(): Promise<CartResponse> {
  const response = await authedJson('/cart', {}, LIST_FAILED);
  return readCart(response);
}

/** Adds by variant or quick-adds by product (server increments when present). */
export async function addToCart(
  identity: CartAddInput,
  quantity: number,
): Promise<CartItemDto> {
  const response = await authedJson(
    '/cart/items',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...identity, quantity }),
    },
    ADD_FAILED,
  );
  return (await response.json()) as CartItemDto;
}

/** Sets a line quantity (absolute). */
export async function updateCartItemQty(
  variantId: string,
  quantity: number,
): Promise<CartItemDto> {
  const response = await authedJson(
    `/cart/items/${encodeURIComponent(variantId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    },
    UPDATE_FAILED,
  );
  return (await response.json()) as CartItemDto;
}

/** Idempotent removal — resolves true when a line was actually deleted. */
export async function removeCartItem(variantId: string): Promise<boolean> {
  const response = await authedJson(
    `/cart/items/${encodeURIComponent(variantId)}`,
    { method: 'DELETE' },
    REMOVE_FAILED,
  );
  const body = (await response.json().catch(() => undefined)) as {
    removed?: unknown;
  } | undefined;
  return body?.removed === true;
}

/** Clears all lines (idempotent). */
export async function clearCart(): Promise<void> {
  await authedJson('/cart', { method: 'DELETE' }, CLEAR_FAILED);
}

/**
 * Guest→server merge after login (CART-002): replays each guest line
 * through the stock-validated add endpoint, then keeps only the lines that
 * failed in the guest cart so nothing silently vanishes. Per-line failures
 * (409/422/404) are collected for honest display — never thrown.
 */
export async function mergeGuestCart(): Promise<MergeResult> {
  const lines = loadGuestCart();
  if (lines.length === 0) {
    return { merged: 0, failed: [] };
  }
  let merged = 0;
  const remaining: GuestCartLine[] = [];
  const failed: MergeFailure[] = [];
  for (const line of lines) {
    try {
      await addToCart(
        { variantId: line.variantId, productId: line.productId },
        line.quantity,
      );
      merged += 1;
    } catch (error) {
      remaining.push(line);
      failed.push({
        variantId: line.variantId ?? line.productId ?? '',
        message: cartStockError(error).message,
      });
    }
  }
  saveGuestCart(remaining);
  return { merged, failed };
}
