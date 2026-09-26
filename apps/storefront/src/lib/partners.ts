import type {
  PartnerApplicationSummary,
  PartnerDocumentSummary,
  PartnerDocumentType,
  PartnerStatus,
} from '@sabz/types';
import { ApiError } from '@/lib/api';
import { authFetch } from '@/lib/auth-client';

/**
 * Partner-application client (SS-230B): thin browser boundary over the
 * existing `/partners` endpoints (apply, application, documents). All calls
 * go through `authFetch` (Bearer + httpOnly refresh cookie) and are never
 * cached — application state is per-user and client-fresh by contract.
 * Pure helpers stay exported for vitest.
 */

const LOAD_FAILED = 'دریافت درخواست همکاری ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SAVE_FAILED = 'ثبت درخواست همکاری ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SUBMIT_FAILED = 'ارسال درخواست همکاری ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const UPLOAD_FAILED = 'بارگذاری سند ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const REMOVE_FAILED = 'حذف سند ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SESSION_EXPIRED = 'نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید';

/** Client-side upload guard mirroring the server's 10MB multipart limit. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PENDING: 'در انتظار بررسی',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
};

export const PARTNER_DOCUMENT_TYPE_LABELS: Record<PartnerDocumentType, string> = {
  BUSINESS_LICENSE: 'جواز کسب (الزامی برای ارسال)',
  NATIONAL_ID: 'کارت ملی',
  TAX_REGISTRATION: 'سند مالیاتی',
  SUPPORTING: 'سایر مدارک',
};

export interface SubmissionChecklistItem {
  field: string;
  label: string;
  done: boolean;
}

/**
 * Pre-submit checklist mirroring the server's 422 submission policy
 * (businessName, businessLicenseNo, address, city, province + a
 * BUSINESS_LICENSE document). Courtesy only — the server re-validates.
 */
export function submissionChecklist(
  app: PartnerApplicationSummary,
): SubmissionChecklistItem[] {
  return [
    { field: 'businessName', label: 'نام کسب‌وکار', done: app.businessName.trim().length > 0 },
    { field: 'businessLicenseNo', label: 'شماره جواز', done: (app.businessLicenseNo ?? '').trim().length > 0 },
    { field: 'address', label: 'نشانی کسب‌وکار', done: (app.address ?? '').trim().length > 0 },
    { field: 'city', label: 'شهر', done: (app.city ?? '').trim().length > 0 },
    { field: 'province', label: 'استان', done: (app.province ?? '').trim().length > 0 },
    {
      field: 'licenseDocument',
      label: 'سند جواز کسب',
      done: app.documents.some((doc) => doc.type === 'BUSINESS_LICENSE'),
    },
  ];
}

/**
 * Validates the `GET /partners/application` payload shape before anything
 * renders, so a backend regression can never plant a half-broken status.
 */
export function parseApplication(payload: unknown): PartnerApplicationSummary {
  const body = payload as Partial<PartnerApplicationSummary> | null;
  const statuses: PartnerStatus[] = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'];
  if (
    typeof body?.id !== 'string' ||
    typeof body?.businessName !== 'string' ||
    !statuses.includes(body?.approvalStatus as PartnerStatus) ||
    !Array.isArray(body?.documents)
  ) {
    throw new Error(LOAD_FAILED);
  }
  return body as PartnerApplicationSummary;
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

export interface CreateApplicationInput {
  businessName: string;
  businessLicenseNo?: string;
  nationalId?: string;
  website?: string;
  address?: string;
  city?: string;
  province?: string;
}

export interface UpdateApplicationInput extends Partial<CreateApplicationInput> {
  submit?: boolean;
}

/**
 * Owned application, or null when none exists (GET 404). Throws
 * ApiError(401) when the session is dead.
 */
export async function fetchApplication(): Promise<PartnerApplicationSummary | null> {
  let response: Response;
  try {
    response = await authFetch('/partners/application', { cache: 'no-store' });
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      throw unauthorized();
    }
    throw error;
  }
  if (response.status === 401) {
    throw unauthorized();
  }
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    await throwApiError(response, LOAD_FAILED);
  }
  return parseApplication(await response.json().catch(() => undefined));
}

/** Creates the DRAFT application (409 when one already exists). */
export async function createApplication(
  input: CreateApplicationInput,
): Promise<PartnerApplicationSummary> {
  const response = await authedJson(
    '/partners/apply',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    SAVE_FAILED,
  );
  return parseApplication(await response.json().catch(() => undefined));
}

/** Partial edit and/or `{submit:true}` (409 when locked, 422 when incomplete). */
export async function updateApplication(
  input: UpdateApplicationInput,
): Promise<PartnerApplicationSummary> {
  const response = await authedJson(
    '/partners/application',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'submit' in input && input.submit === true ? SUBMIT_FAILED : SAVE_FAILED,
  );
  return parseApplication(await response.json().catch(() => undefined));
}

/**
 * Uploads a business document (multipart; no manual Content-Type so the
 * browser sets the boundary). 10MB+ files are rejected client-side first.
 */
export async function uploadDocument(
  type: PartnerDocumentType,
  file: File,
): Promise<PartnerDocumentSummary> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new ApiError(400, {
      statusCode: 400,
      message: 'حجم فایل نباید بیشتر از ۱۰ مگابایت باشد.',
      error: 'File too large',
    });
  }
  const form = new FormData();
  form.append('type', type);
  form.append('file', file);
  const response = await authedJson(
    '/partners/documents',
    { method: 'POST', body: form },
    UPLOAD_FAILED,
  );
  return (await response.json()) as PartnerDocumentSummary;
}

/** Idempotent-feeling removal — resolves true when a row was deleted. */
export async function removeDocument(documentId: string): Promise<boolean> {
  const response = await authedJson(
    `/partners/documents/${encodeURIComponent(documentId)}`,
    { method: 'DELETE' },
    REMOVE_FAILED,
  );
  const body = (await response.json().catch(() => undefined)) as {
    removed?: unknown;
  } | undefined;
  return body?.removed === true;
}
