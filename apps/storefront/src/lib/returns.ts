import type {
  CreateReturnRequestInput,
  ReturnListResponse,
  ReturnRequestDto,
  ReturnStatus,
} from '@sabz/types';
import { RETURN_STATUS_FA } from '@sabz/types';
import { ApiError } from '@/lib/api';
import { authFetch } from '@/lib/auth-client';

/**
 * Customer returns client (SS-242): thin browser boundary over `/returns`.
 * All calls go through `authFetch`; responses are never cached — return
 * state is per-user and client-fresh by contract.
 */

const LIST_FAILED = 'دریافت مرجوعی‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const DETAIL_FAILED = 'دریافت جزئیات مرجوعی ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const CREATE_FAILED = 'ثبت درخواست مرجوعی ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const CANCEL_FAILED = 'لغو درخواست مرجوعی ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SESSION_EXPIRED = 'نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید';

export { RETURN_STATUS_FA };

/** Persian label for a return status (shared @sabz/types map). */
export function returnStatusLabel(status: ReturnStatus): string {
  // Fall back to the raw code so a stale @sabz/types dist (e.g. an old
  // storefront container image) can never crash the page — the label just
  // renders untranslated until the image is rebuilt.
  return RETURN_STATUS_FA[status] ?? status;
}

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

async function authedJson(path: string, init: RequestInit, fallback: string): Promise<Response> {
  let response: Response;
  try {
    response = await authFetch(path, { ...init, cache: 'no-store' });
  } catch (error) {
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

/** Owner return history, newest first. */
export async function fetchReturns(status?: ReturnStatus): Promise<ReturnListResponse> {
  const query = status === undefined ? '' : `?status=${encodeURIComponent(status)}`;
  const response = await authedJson(`/returns${query}`, {}, LIST_FAILED);
  return (await response.json()) as ReturnListResponse;
}

/** One own return (cross-user ids 404). */
export async function fetchReturnDetail(id: string): Promise<ReturnRequestDto> {
  const response = await authedJson(
    `/returns/${encodeURIComponent(id)}`,
    {},
    DETAIL_FAILED,
  );
  return (await response.json()) as ReturnRequestDto;
}

/** Files a return request for an owned DELIVERED order. */
export async function createReturn(
  input: CreateReturnRequestInput,
): Promise<ReturnRequestDto> {
  const response = await authedJson(
    '/returns',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    CREATE_FAILED,
  );
  return (await response.json()) as ReturnRequestDto;
}

/** Withdraws a PENDING return request. */
export async function cancelReturn(id: string): Promise<ReturnRequestDto> {
  const response = await authedJson(
    `/returns/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' },
    CANCEL_FAILED,
  );
  return (await response.json()) as ReturnRequestDto;
}
