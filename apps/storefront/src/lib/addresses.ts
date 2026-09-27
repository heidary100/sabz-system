import type {
  AddressDto,
  AddressListResponse,
  CreateAddressInput,
  UpdateAddressInput,
} from '@sabz/types';
import { ApiError } from '@/lib/api';
import { authFetch } from '@/lib/auth-client';

/**
 * Customer address-book client (SS-233): thin browser boundary over
 * `/addresses`. All calls go through `authFetch` (Bearer + httpOnly refresh
 * cookie); responses are never cached — the book is per-user and
 * client-fresh by contract. Pure helpers stay exported for vitest.
 */

const LIST_FAILED = 'دریافت نشانی‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SAVE_FAILED = 'ذخیره نشانی ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const REMOVE_FAILED = 'حذف نشانی ناموفق بود؛ لطفاً دوباره تلاش کنید.';
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

/**
 * Validates the `GET /addresses` payload shape before anything renders, so
 * a backend regression can never plant a half-broken address list.
 */
export function parseAddressList(payload: unknown): AddressDto[] {
  const body = payload as AddressListResponse | null;
  if (!Array.isArray(body?.items)) {
    throw new Error(LIST_FAILED);
  }
  return body.items;
}

/** The default address (first by server order) or null when none exists. */
export function defaultAddress(addresses: AddressDto[]): AddressDto | null {
  return addresses.find((address) => address.isDefault) ?? addresses[0] ?? null;
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

/** Address book, default first; throws ApiError(401) when the session is dead. */
export async function fetchAddresses(): Promise<AddressDto[]> {
  const response = await authedJson('/addresses', {}, LIST_FAILED);
  return parseAddressList(await response.json().catch(() => undefined));
}

/** Adds an entry (first entry becomes the default server-side). */
export async function createAddress(input: CreateAddressInput): Promise<AddressDto> {
  const response = await authedJson(
    '/addresses',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    SAVE_FAILED,
  );
  return (await response.json()) as AddressDto;
}

/** Partial update (promotion, edits, clears). */
export async function updateAddress(
  id: string,
  input: UpdateAddressInput,
): Promise<AddressDto> {
  const response = await authedJson(
    `/addresses/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    SAVE_FAILED,
  );
  return (await response.json()) as AddressDto;
}

/** Idempotent removal — resolves true when a row was actually deleted. */
export async function removeAddress(id: string): Promise<boolean> {
  const response = await authedJson(
    `/addresses/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    REMOVE_FAILED,
  );
  const body = (await response.json().catch(() => undefined)) as {
    removed?: unknown;
  } | undefined;
  return body?.removed === true;
}
