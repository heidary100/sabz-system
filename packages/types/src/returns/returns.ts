/**
 * Returns workflow contract (SS-242, master plan §6 Stage 3).
 *
 * Owners request returns for owned DELIVERED orders within the return
 * window; operators review (approve/reject), mark receipt, and close out.
 * The request records the decision only — no order-status mutation and no
 * restock/refund side effects in SS-242.
 */

export type ReturnStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'RECEIVED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export const RETURN_STATUS_FA: Record<ReturnStatus, string> = {
  PENDING: 'در انتظار بررسی',
  APPROVED: 'تأیید شد',
  RECEIVED: 'دریافت شد',
  COMPLETED: 'تکمیل شد',
  REJECTED: 'رد شد',
  CANCELLED: 'لغو شد',
};

export interface CreateReturnItemInput {
  orderItemId: string;
  quantity: number;
}

export interface CreateReturnRequestInput {
  orderId: string;
  reason: string;
  items: CreateReturnItemInput[];
}

export interface ReturnItemDto {
  id: string;
  orderItemId: string;
  variantId: string;
  productName: string;
  variantName: string | null;
  sku: string;
  quantity: number;
}

export interface ReturnRequestDto {
  id: string;
  orderId: string;
  orderNumber: number;
  status: ReturnStatus;
  statusFa: string;
  reason: string;
  rejectReason: string | null;
  items: ReturnItemDto[];
  receivedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReturnListResponse {
  items: ReturnRequestDto[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Admin queue row (SS-242). Extends the owner projection with the owner
 * identity operators need — denormalized at read time (SS-240B
 * `customerMobile` precedent).
 */
export interface AdminReturnListItemDto extends ReturnRequestDto {
  userId: string;
  customerMobile: string;
}

export interface AdminReturnListResponse {
  items: AdminReturnListItemDto[];
  total: number;
  page: number;
  limit: number;
}

export type AdminReturnDetailDto = AdminReturnListItemDto;
