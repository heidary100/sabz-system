import type {
  CreateReviewInput,
  ReviewDto,
  ReviewListResponse,
} from '@sabz/types';
import { ApiError, request } from '@/lib/api';
import { authFetch } from '@/lib/auth-client';

/**
 * Product reviews client (SS-236): thin boundary over `/reviews`.
 * The approved list is public and read server-side (no client-side
 * catalog fetching, SS-217); submission goes through `authFetch`.
 * Ratings are unit-free (1–5); nothing monetary flows here.
 */

const LIST_FAILED = 'دریافت دیدگاه‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const CREATE_FAILED = 'ثبت دیدگاه ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SESSION_EXPIRED = 'نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید';

/** Public list path for a product's approved reviews (page/limit). */
export function productReviewsPath(
  productId: string,
  page = 1,
  limit = 10,
): string {
  return `/reviews/product/${encodeURIComponent(productId)}?page=${page}&limit=${limit}`;
}

/** Approved reviews of a product, newest first (public, paginated). */
export async function fetchProductReviews(
  productId: string,
  page = 1,
  limit = 10,
): Promise<ReviewListResponse> {
  try {
    return await request<ReviewListResponse>(productReviewsPath(productId, page, limit), {
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, {
      statusCode: 0,
      message: LIST_FAILED,
      error: LIST_FAILED,
    });
  }
}

/** Files a review for a published product (→ PENDING moderation). */
export async function createReview(input: CreateReviewInput): Promise<ReviewDto> {
  let response: Response;
  try {
    response = await authFetch('/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      throw new ApiError(401, {
        statusCode: 401,
        message: SESSION_EXPIRED,
        error: 'Unauthorized',
      });
    }
    throw error;
  }
  if (response.status === 401) {
    throw new ApiError(401, {
      statusCode: 401,
      message: SESSION_EXPIRED,
      error: 'Unauthorized',
    });
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { message?: unknown }
      | undefined;
    const message =
      typeof body?.message === 'string' && body.message !== ''
        ? body.message
        : CREATE_FAILED;
    throw new ApiError(response.status, {
      statusCode: response.status,
      message,
      error: CREATE_FAILED,
    });
  }
  return (await response.json()) as ReviewDto;
}
