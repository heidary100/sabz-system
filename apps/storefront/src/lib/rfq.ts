import type {
  AcceptRfqInput,
  PlaceOrderResult,
  RfqDto,
  RfqListResponse,
  RfqStatus,
} from '@sabz/types';
import { RFQ_STATUS_FA } from '@sabz/types';
import { ApiError } from '@/lib/api';
import { authFetch } from '@/lib/auth-client';

/**
 * Customer RFQ client (SS-235 B2): thin browser boundary over `/rfq`.
 * All calls go through `authFetch`; responses are never cached — RFQ
 * state is per-user and client-fresh by contract. Money arrives Rial
 * verbatim and is presented via `lib/currency.ts` / `lib/format.ts`.
 */

const LIST_FAILED = 'دریافت استعلام‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const DETAIL_FAILED = 'دریافت جزئیات استعلام ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const CREATE_FAILED = 'ثبت استعلام ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const ACCEPT_FAILED = 'پذیرش استعلام ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SESSION_EXPIRED = 'نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید';

const STATUS_FALLBACK_FA: Record<RfqStatus, string> = {
  PENDING: 'در انتظار استعلام',
  QUOTED: 'قیمت اعلام شد',
  ACCEPTED: 'پذیرفته شد',
  REJECTED: 'رد شد',
  EXPIRED: 'منقضی شد',
};

/** Persian label for an RFQ status (stale-dist tolerant, see orders.ts). */
export function rfqStatusLabel(status: RfqStatus): string {
  return RFQ_STATUS_FA?.[status] ?? STATUS_FALLBACK_FA[status] ?? status;
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

/** Own RFQ history, newest first (operators see every row). */
export async function fetchRfqs(status?: RfqStatus): Promise<RfqListResponse> {
  const query = status === undefined ? '' : `?status=${encodeURIComponent(status)}`;
  const response = await authedJson(`/rfq${query}`, {}, LIST_FAILED);
  return (await response.json()) as RfqListResponse;
}

/** One own RFQ (cross-user ids 404). */
export async function fetchRfqDetail(id: string): Promise<RfqDto> {
  const response = await authedJson(
    `/rfq/${encodeURIComponent(id)}`,
    {},
    DETAIL_FAILED,
  );
  return (await response.json()) as RfqDto;
}

/** Files a quotation request against a call-for-price variant. */
export async function createRfq(variantId: string, quantity: number): Promise<RfqDto> {
  const response = await authedJson(
    '/rfq',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId, quantity }),
    },
    CREATE_FAILED,
  );
  return (await response.json()) as RfqDto;
}

/** Accepts a live quotation — freezes the quoted price into an order. */
export async function acceptRfq(id: string, input: AcceptRfqInput): Promise<PlaceOrderResult> {
  const response = await authedJson(
    `/rfq/${encodeURIComponent(id)}/accept`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    ACCEPT_FAILED,
  );
  return (await response.json()) as PlaceOrderResult;
}
