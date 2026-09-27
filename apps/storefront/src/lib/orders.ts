import type {
  InvoiceDto,
  OrderDetailDto,
  OrderListResponse,
  OrderStatus,
} from '@sabz/types';
import { ORDER_STATUS_FA } from '@sabz/types';
import { ApiError } from '@/lib/api';
import { authFetch } from '@/lib/auth-client';

/**
 * Customer orders client (SS-233): thin browser boundary over `/orders`.
 * All calls go through `authFetch`; responses are never cached — history is
 * per-user and client-fresh by contract.
 */

const LIST_FAILED = 'دریافت سفارش‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const DETAIL_FAILED = 'دریافت جزئیات سفارش ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const CANCEL_FAILED = 'لغو سفارش ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SESSION_EXPIRED = 'نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید';

export { ORDER_STATUS_FA };

/** Persian label for an order status (shared @sabz/types map). */
export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_FA[status];
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

/** Order history, newest first. */
export async function fetchOrders(status?: OrderStatus): Promise<OrderListResponse> {
  const query = status === undefined ? '' : `?status=${encodeURIComponent(status)}`;
  const response = await authedJson(`/orders${query}`, {}, LIST_FAILED);
  return (await response.json()) as OrderListResponse;
}

/** One own order (cross-user ids 404). */
export async function fetchOrderDetail(id: string): Promise<OrderDetailDto> {
  const response = await authedJson(
    `/orders/${encodeURIComponent(id)}`,
    {},
    DETAIL_FAILED,
  );
  return (await response.json()) as OrderDetailDto;
}

/** Cancels a PENDING order (restocks server-side). */
export async function cancelOrder(id: string): Promise<OrderDetailDto> {
  const response = await authedJson(
    `/orders/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' },
    CANCEL_FAILED,
  );
  return (await response.json()) as OrderDetailDto;
}

/** Invoice data for the HTML print route. */
export async function fetchInvoice(id: string): Promise<InvoiceDto> {
  const response = await authedJson(
    `/orders/${encodeURIComponent(id)}/invoice`,
    {},
    DETAIL_FAILED,
  );
  return (await response.json()) as InvoiceDto;
}
