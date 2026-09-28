/**
 * Product reviews contract (SS-236, master plan §5.8).
 *
 * Customers rate a published product 1–5 with an optional Persian comment.
 * Every review starts PENDING and becomes visible only after operator
 * moderation (APPROVED); REJECTED rows never surface publicly. One review
 * per (user, product) pair. Public projections never expose reviewer
 * identity — only the rating, comment, and timestamp.
 */

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const REVIEW_STATUS_FA: Record<ReviewStatus, string> = {
  PENDING: 'در انتظار بررسی',
  APPROVED: 'تأیید شد',
  REJECTED: 'رد شد',
};

export interface CreateReviewInput {
  productId: string;
  /** Integer 1–5. */
  rating: number;
  /** Optional comment (max 2000 characters). */
  comment?: string;
}

export interface ReviewDto {
  id: string;
  productId: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  statusFa: string;
  createdAt: string;
}

export interface ReviewListResponse {
  items: ReviewDto[];
  total: number;
  page: number;
  limit: number;
  /** Average of APPROVED ratings (1 decimal); null when none exist. */
  ratingAverage: number | null;
  /** Count of APPROVED reviews. */
  ratingCount: number;
}
