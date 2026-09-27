import type {
  CheckoutSummaryDto,
  PaymentMethod,
  PaymentMethodDto,
  PlaceOrderResult,
  ShippingMethodDto,
} from '@sabz/types';
import { ApiError } from '@/lib/api';
import { authFetch } from '@/lib/auth-client';

/**
 * Customer checkout client (SS-233): thin browser boundary over
 * `/checkout/*` and `POST /orders/checkout`. All calls go through
 * `authFetch`; responses are never cached. The client sends only
 * `addressId` + `paymentMethod` — never money (CART-004). Pure helpers
 * stay exported for vitest.
 */

const CHOICE_FAILED = 'دریافت گزینه‌های تسویه ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const VALIDATE_FAILED = 'بررسی سبد خرید ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const PLACE_FAILED = 'ثبت سفارش ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SESSION_EXPIRED = 'نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید';

export const CHECKOUT_STEPS = ['cart', 'address', 'shipping', 'payment', 'review'] as const;

export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];

const STEP_FA: Record<CheckoutStep, string> = {
  cart: 'بررسی سبد',
  address: 'نشانی',
  shipping: 'شیوه ارسال',
  payment: 'شیوه پرداخت',
  review: 'بازبینی و ثبت',
};

/** Persian label for a wizard step. */
export function stepLabel(step: CheckoutStep): string {
  return STEP_FA[step];
}

/** Parses the `?step=` search param; unknown values fall back to `cart`. */
export function parseCheckoutStep(value: unknown): CheckoutStep {
  return (CHECKOUT_STEPS as readonly string[]).includes(value as string)
    ? (value as CheckoutStep)
    : 'cart';
}

/** Serializes the wizard step back to a search string. */
export function serializeCheckoutStep(step: CheckoutStep): string {
  return `step=${step}`;
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
  available?: unknown;
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const body = (await response.json().catch(() => undefined)) as
    | ApiErrorBody
    | undefined;
  const message =
    typeof body?.message === 'string' && body.message !== ''
      ? body.message
      : fallback;
  const payload: { statusCode: number; message: string; error: string; available?: number } = {
    statusCode: response.status,
    message,
    error: fallback,
  };
  if (typeof body?.available === 'number') {
    payload.available = body.available;
  }
  throw new ApiError(response.status, payload);
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

/** Static v1 shipping choices (fees arrive with SS-241). */
export async function fetchShippingMethods(): Promise<ShippingMethodDto[]> {
  const response = await authedJson('/checkout/shipping-methods', {}, CHOICE_FAILED);
  const body = (await response.json().catch(() => undefined)) as {
    items?: unknown;
  } | undefined;
  if (!Array.isArray(body?.items)) {
    throw new Error(CHOICE_FAILED);
  }
  return body.items as ShippingMethodDto[];
}

/** Static v1 payment choices (SS-234 COD-only: ONLINE listed but disabled). */
export async function fetchPaymentMethods(): Promise<PaymentMethodDto[]> {
  const response = await authedJson('/checkout/payment-methods', {}, CHOICE_FAILED);
  const body = (await response.json().catch(() => undefined)) as {
    items?: unknown;
  } | undefined;
  if (!Array.isArray(body?.items)) {
    throw new Error(CHOICE_FAILED);
  }
  return body.items as PaymentMethodDto[];
}

/**
 * Whether a payment method is selectable. Tolerates payloads from an older
 * API without the SS-234 `enabled` flag (missing = enabled, except ONLINE
 * which stays conservative until the gateway ticket lands).
 */
export function isPaymentEnabled(method: PaymentMethodDto): boolean {
  if (typeof method.enabled === 'boolean') {
    return method.enabled;
  }
  return method.code !== 'ONLINE';
}

/**
 * Default payment selection (SS-234 COD-only): the first enabled method
 * with COD preferred. Returns null when every method is disabled.
 */
export function defaultPaymentMethod(methods: PaymentMethodDto[]): PaymentMethod | null {
  const enabled = methods.filter(isPaymentEnabled);
  return (
    enabled.find((method) => method.code === 'COD')?.code ??
    enabled[0]?.code ??
    null
  );
}

/** Read-only checkout preview (no side effects) for the review step. */
export async function validateCheckout(addressId?: string): Promise<CheckoutSummaryDto> {
  const response = await authedJson(
    '/checkout/validate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addressId === undefined ? {} : { addressId }),
    },
    VALIDATE_FAILED,
  );
  return (await response.json()) as CheckoutSummaryDto;
}

/** Places the order from the server cart; clears the cart on success. */
export async function placeOrder(
  addressId: string,
  paymentMethod: PaymentMethod,
): Promise<PlaceOrderResult> {
  const response = await authedJson(
    '/orders/checkout',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addressId, paymentMethod }),
    },
    PLACE_FAILED,
  );
  return (await response.json()) as PlaceOrderResult;
}
