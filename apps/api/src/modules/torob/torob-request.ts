import { isTorobSort } from '@sabz/types';
import type { TorobProductsRequest } from '@sabz/types';
import { TorobBadRequestException } from './torob-error';

/**
 * Manual validation of Torob feed requests (SS-239).
 *
 * The v3 spec mandates the exact `{error: string}` body on 400s, which the
 * global ValidationPipe envelope would clobber — so this is a hand-rolled,
 * framework-free parse. Exactly one of the four request shapes may appear
 * per request; `sort` is mandatory for the page and cursor modes (the spec
 * defines no default sort) and ignored for the by-urls/uniques modes.
 */

const MAX_LIST_ITEMS = 100;
const MAX_URL_LENGTH = 2048;
const MAX_CURSOR_LENGTH = 512;

const MESSAGES = {
  body: 'درخواست نامعتبر است: بدنه باید یک شیء JSON باشد.',
  mixed:
    'درخواست نامعتبر است: فقط یکی از page، cursor، page_urls یا page_uniques مجاز است.',
  shape: 'درخواست نامعتبر است: یکی از page، cursor، page_urls یا page_uniques الزامی است.',
  page: 'page باید یک عدد صحیح بزرگ‌تر از صفر باشد.',
  cursor: 'cursor باید یک رشته غیرخالی باشد.',
  pageUrls: 'page_urls باید آرایه‌ای غیرخالی از آدرس‌ها (حداکثر ۱۰۰ مورد) باشد.',
  pageUniques: 'page_uniques باید آرایه‌ای غیرخالی از شناسه‌ها (حداکثر ۱۰۰ مورد) باشد.',
  sort: 'sort الزامی است و باید یکی از مقادیر مجاز باشد.',
};

function requireString(value: unknown, message: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TorobBadRequestException(message);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new TorobBadRequestException(message);
  }
  return trimmed;
}

function requireStringList(value: unknown, message: string, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LIST_ITEMS) {
    throw new TorobBadRequestException(message);
  }
  return value.map((item) => requireString(item, message, maxLength));
}

/**
 * Parses an unvalidated request body into one of the four Torob request
 * shapes, throwing the spec-shaped 400 on any violation.
 */
export function parseTorobProductsRequest(body: unknown): TorobProductsRequest {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    Object.getPrototypeOf(body) === null
  ) {
    throw new TorobBadRequestException(MESSAGES.body);
  }
  const raw = body as Record<string, unknown>;

  const shapeKeys = ['page', 'cursor', 'page_urls', 'page_uniques'].filter(
    (key) => key in raw && raw[key] !== undefined,
  );
  if (shapeKeys.length > 1) {
    throw new TorobBadRequestException(MESSAGES.mixed);
  }
  if (shapeKeys.length === 0) {
    throw new TorobBadRequestException(MESSAGES.shape);
  }
  const shape = shapeKeys[0];

  if (shape === 'page') {
    const page = raw.page;
    if (
      typeof page !== 'number' ||
      !Number.isInteger(page) ||
      page < 1
    ) {
      throw new TorobBadRequestException(MESSAGES.page);
    }
    if (!isTorobSort(raw.sort)) {
      throw new TorobBadRequestException(MESSAGES.sort);
    }
    return { page, sort: raw.sort };
  }

  if (shape === 'cursor') {
    const cursor = requireString(raw.cursor, MESSAGES.cursor, MAX_CURSOR_LENGTH);
    if (!isTorobSort(raw.sort)) {
      throw new TorobBadRequestException(MESSAGES.sort);
    }
    return { cursor, sort: raw.sort };
  }

  if (shape === 'page_urls') {
    return { page_urls: requireStringList(raw.page_urls, MESSAGES.pageUrls, MAX_URL_LENGTH) };
  }
  return {
    page_uniques: requireStringList(raw.page_uniques, MESSAGES.pageUniques, MAX_URL_LENGTH),
  };
}
