/**
 * Torob Product API v3 contract (SS-239, master plan §5.11).
 *
 * Shapes the request bodies Torob sends to `POST /torob/products` and the
 * paginated feed envelope the endpoint returns. Money here is **Toman
 * integers** (Torob's unit); the API resolves them from Rial-verbatim
 * storage at the service boundary (floor ÷10, SS-222).
 *
 * Source: Torob-Sync `product_api_v3.md` + `torob_api_token_guide.md`.
 */

/** Sort modes Torob requests (no defaults — missing sort is a 400). */
export type TorobSort = 'date_added_desc' | 'date_updated_desc' | 'product_id_desc';

export const TOROB_SORTS: readonly TorobSort[] = [
  'date_added_desc',
  'date_updated_desc',
  'product_id_desc',
] as const;

export function isTorobSort(value: unknown): value is TorobSort {
  return (
    value === 'date_added_desc' ||
    value === 'date_updated_desc' ||
    value === 'product_id_desc'
  );
}

/** The four accepted request bodies (exactly one shape per request). */
export interface TorobProductsByUrlsRequest {
  page_urls: string[];
}

export interface TorobProductsByUniquesRequest {
  page_uniques: string[];
}

export interface TorobProductsPageRequest {
  page: number;
  sort: TorobSort;
}

export interface TorobProductsCursorRequest {
  cursor: string;
  sort: TorobSort;
}

export type TorobProductsRequest =
  | TorobProductsByUrlsRequest
  | TorobProductsByUniquesRequest
  | TorobProductsPageRequest
  | TorobProductsCursorRequest;

/** One feed row = one PRICED variant (Torob groups rows by product_group_id). */
export interface TorobProductDto {
  page_unique: string;
  page_url: string;
  product_group_id: string;
  title: string;
  subtitle?: string;
  current_price: number;
  old_price?: number;
  availability: boolean;
  category_name?: string;
  image_links: string[];
  short_desc?: string;
  spec: Record<string, string | number>;
  guarantee?: string;
  date_added: string;
  date_updated?: string;
}

export interface TorobProductsResponse {
  api_version: 'torob_api_v3';
  current_page: number;
  total: number | null;
  max_pages: number | null;
  next_cursor: string | null;
  products: TorobProductDto[];
}

/** Error envelope Torob expects on invalid requests. */
export interface TorobErrorResponse {
  error: string;
}
