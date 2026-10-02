import type {
  NotificationDto,
  NotificationListResponse,
  NotificationType,
  UnreadCountResponse,
} from '@sabz/types';
import { NOTIFICATION_TYPE_FA } from '@sabz/types';
import { ApiError } from '@/lib/api';
import { authFetch } from '@/lib/auth-client';

/**
 * Customer notifications client (SS-243): thin browser boundary over
 * `/notifications`. All calls go through `authFetch`; responses are never
 * cached — notification state is per-user and client-fresh by contract.
 */

const LIST_FAILED = 'دریافت اعلان‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const COUNT_FAILED = 'دریافت تعداد اعلان‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const READ_FAILED = 'ثبت خوانده شدن اعلان ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SESSION_EXPIRED = 'نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید';

export { NOTIFICATION_TYPE_FA };

/** Persian label for a notification type (shared @sabz/types map). */
export function notificationTypeLabel(type: NotificationType): string {
  // Fall back to the raw code so a stale @sabz/types dist (e.g. an old
  // storefront container image) can never crash the page — there the whole
  // map is undefined, not just missing a key, so the lookup itself must be
  // optional-chained; the label just renders untranslated until the rebuild.
  return NOTIFICATION_TYPE_FA?.[type] ?? type;
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

/** Owner notification history, newest first. */
export async function fetchNotifications(
  unreadOnly?: boolean,
): Promise<NotificationListResponse> {
  const query = unreadOnly === true ? '?unreadOnly=true' : '';
  const response = await authedJson(`/notifications${query}`, {}, LIST_FAILED);
  return (await response.json()) as NotificationListResponse;
}

/** Owner unread count (header badge). */
export async function fetchUnreadCount(): Promise<UnreadCountResponse> {
  const response = await authedJson(
    '/notifications/unread-count',
    {},
    COUNT_FAILED,
  );
  return (await response.json()) as UnreadCountResponse;
}

/** Marks one owned notification read (idempotent). */
export async function markNotificationRead(
  id: string,
): Promise<NotificationDto> {
  const response = await authedJson(
    `/notifications/${encodeURIComponent(id)}/read`,
    { method: 'PATCH' },
    READ_FAILED,
  );
  return (await response.json()) as NotificationDto;
}
