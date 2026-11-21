import { API_BASE_URL, ApiError } from '@/lib/api';
import { AUTH_STATE_EVENT } from '@/lib/auth-events';
import { toEnglishDigits } from '@/lib/digits';

export { toEnglishDigits };

/**
 * Customer auth client (SS-230): thin browser boundary over the merged
 * backend OTP contract. Tokens live in localStorage (`sabz.accessToken`);
 * the httpOnly refresh cookie is carried by `credentials: 'include'` on
 * every request. Pure helpers stay exported for vitest.
 */

const ACCESS_TOKEN_KEY = 'sabz.accessToken';

/** Single-flight refresh shared by concurrent 401s in this tab. */
type RefreshResult =
  | { status: 'refreshed'; accessToken: string }
  | { status: 'expired' }
  | { status: 'unavailable' };
let refreshPromise: Promise<RefreshResult> | null = null;

export interface AuthSession {
  userId: string;
  mobile: string;
}

export interface ProfilePayload {
  id: string;
  mobile: string;
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  hasNationalId: boolean;
  maskedNationalId: string | null;
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  address?: string;
  nationalId?: string;
}

/** Iranian mobile: 11 ASCII digits starting with 09 (Persian input folded). */
export function isValidIranianMobile(value: string): boolean {
  return /^09\d{9}$/.test(toEnglishDigits(value).trim());
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

function notifyAuthState(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
}

function setStoredToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  notifyAuthState();
}

function clearStoredToken(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  notifyAuthState();
}

/** Read access for the authenticated WebSocket handshake (never logged). */
export function getAccessToken(): string | null {
  return getStoredToken();
}

/** True when an access token is stored (client only). */
export function hasSession(): boolean {
  return getStoredToken() !== null;
}

interface ApiErrorBody {
  message?: unknown;
  statusCode?: unknown;
}

function errorMessage(body: ApiErrorBody | undefined, fallback: string): string {
  if (typeof body?.message === 'string' && body.message !== '') {
    return body.message;
  }
  // Nest's ValidationPipe returns a string array for DTO constraint errors.
  if (Array.isArray(body?.message)) {
    const first = body.message.find(
      (message): message is string =>
        typeof message === 'string' && message !== '',
    );
    if (first !== undefined) {
      return first;
    }
  }
  return fallback;
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const body = (await response.json().catch(() => undefined)) as
    | ApiErrorBody
    | undefined;
  throw new ApiError(response.status, {
    statusCode: response.status,
    message: errorMessage(body, fallback),
    error: fallback,
  });
}

/**
 * Pure verify-otp response parser: validates the `{user, accessToken}`
 * shape before anything is stored. Throws on malformed payloads so a
 * backend regression can never plant a half session.
 */
export function parseAuthPayload(payload: unknown): {
  session: AuthSession;
  accessToken: string;
} {
  const body = payload as {
    user?: { id?: unknown; mobile?: unknown };
    accessToken?: unknown;
  } | null;
  const userId = body?.user?.id;
  const mobile = body?.user?.mobile;
  const accessToken = body?.accessToken;
  if (typeof userId !== 'string' || typeof mobile !== 'string' || typeof accessToken !== 'string') {
    throw new Error('پاسخ نامعتبر از سرور');
  }
  return { session: { userId, mobile }, accessToken };
}

/** Sends the OTP for a (normalized) mobile number. */
export async function requestOtp(mobile: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/request-otp`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: toEnglishDigits(mobile).trim() }),
  });
  if (!response.ok) {
    await throwApiError(response, 'ارسال کد ناموفق بود');
  }
}

/** Verifies the OTP, stores the access token, returns the session. */
export async function verifyOtp(mobile: string, code: string): Promise<AuthSession> {
  const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobile: toEnglishDigits(mobile).trim(),
      code: toEnglishDigits(code).trim(),
    }),
  });
  if (!response.ok) {
    await throwApiError(response, 'تأیید کد ناموفق بود');
  }
  const { session, accessToken } = parseAuthPayload(
    (await response.json().catch(() => undefined)) as unknown,
  );
  setStoredToken(accessToken);
  return session;
}

function withAuthHeader(token: string | null, init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...(token !== null && { Authorization: `Bearer ${token}` }),
    },
  };
}

/**
 * Refreshes the access token once for all concurrent 401s in this tab.
 * Only an explicit 401/403 from the refresh endpoint means the session is
 * over. Throttling, 5xx and network failures are transient and must not
 * remove a valid stored token.
 */
async function refreshAccessToken(): Promise<RefreshResult> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (refresh) => {
        if (refresh.status === 401 || refresh.status === 403) {
          return { status: 'expired' as const };
        }
        if (!refresh.ok) {
          return { status: 'unavailable' as const };
        }
        const body = (await refresh.json().catch(() => undefined)) as
          | { accessToken?: unknown }
          | undefined;
        if (typeof body?.accessToken !== 'string' || body.accessToken === '') {
          return { status: 'unavailable' as const };
        }
        setStoredToken(body.accessToken);
        return { status: 'refreshed' as const, accessToken: body.accessToken };
      })
      .catch(() => ({ status: 'unavailable' as const }))
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Authenticated fetch: attaches the Bearer token and always sends cookies.
 * On a single 401 it refreshes (cookie fallback) once, stores the new
 * token, and retries; when the refresh fails the stored token is cleared
 * and the original 401 response is rethrown.
 */
export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    withAuthHeader(getStoredToken(), init),
  );
  if (response.status !== 401) {
    return response;
  }
  const refresh = await refreshAccessToken();
  if (refresh.status === 'expired') {
    clearStoredToken();
    throw response;
  }
  if (refresh.status === 'unavailable') {
    // Keep the token/session for a retry; only the refresh attempt failed.
    throw response;
  }
  const retry = await fetch(
    `${API_BASE_URL}${path}`,
    withAuthHeader(refresh.accessToken, init),
  );
  if (retry.status === 401) {
    clearStoredToken();
    throw retry;
  }
  return retry;
}

function isUnauthorized(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 401;
  }
  return error instanceof Response && error.status === 401;
}

async function readPayload<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    await throwApiError(response, fallback);
  }
  return (await response.json()) as T;
}

/** Current customer profile; 401/404 surface as thrown ApiError. */
export async function fetchProfile(): Promise<ProfilePayload> {
  try {
    const response = await authFetch('/auth/profile', { cache: 'no-store' });
    return await readPayload<ProfilePayload>(response, 'دریافت اطلاعات ناموفق بود');
  } catch (error) {
    if (isUnauthorized(error)) {
      throw new ApiError(401, {
        statusCode: 401,
        message: 'نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید',
        error: 'Unauthorized',
      });
    }
    throw error;
  }
}

/** Partial profile update (all fields optional). */
export async function updateProfile(data: UpdateProfileInput): Promise<ProfilePayload> {
  try {
    const response = await authFetch('/auth/profile', {
      method: 'PATCH',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await readPayload<ProfilePayload>(response, 'ذخیره اطلاعات ناموفق بود');
  } catch (error) {
    if (isUnauthorized(error)) {
      throw new ApiError(401, {
        statusCode: 401,
        message: 'نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید',
        error: 'Unauthorized',
      });
    }
    throw error;
  }
}

/** Server-side logout; the stored token is always cleared. */
export async function logout(): Promise<void> {
  try {
    // The API logout endpoint is Bearer-guarded: without the access token it
    // returns 401 and neither revokes the session nor clears the HttpOnly
    // refresh cookie. The local token is cleared even when the call fails.
    await fetch(
      `${API_BASE_URL}/auth/logout`,
      withAuthHeader(getStoredToken(), { method: 'POST' }),
    );
  } finally {
    clearStoredToken();
  }
}
