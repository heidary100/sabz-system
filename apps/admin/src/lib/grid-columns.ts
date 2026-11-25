/**
 * Column definitions + visibility persistence for the editable catalog/pricing
 * grid (rendered as the Products page).
 *
 * The operational core (product name, SKU, stock, regular + sale price, row
 * actions) is never hideable, so an operator can always act on a row;
 * informational/currency columns toggle via the checkbox list. Preference
 * lives in localStorage — a per-browser display concern, not user data.
 */

export type GridColumnKey =
  | 'thumbnail'
  | 'name'
  | 'variantName'
  | 'sku'
  | 'barcode'
  | 'brand'
  | 'category'
  | 'stock'
  | 'regularPrice'
  | 'discountedPrice'
  | 'discountWindow'
  | 'aedPrice'
  | 'usdPrice'
  | 'partnerPrice'
  | 'effectivePrice'
  | 'priceUpdatedAt'
  | 'priceStatus'
  | 'productStatus'
  | 'condition'
  | 'created'
  | 'storefrontLink'

export const GRID_COLUMN_STORAGE_KEY = 'sabz-admin-catalog-grid-columns'

export const GRID_COLUMN_LABELS: Record<GridColumnKey, string> = {
  thumbnail: 'تصویر',
  name: 'نام محصول',
  variantName: 'نام نوع',
  sku: 'شناسه کالا (SKU)',
  barcode: 'بارکد',
  brand: 'برند',
  category: 'دسته‌بندی',
  stock: 'موجودی',
  regularPrice: 'قیمت عادی (ریال)',
  discountedPrice: 'قیمت فروش ویژه (ریال)',
  discountWindow: 'بازه فروش ویژه',
  aedPrice: 'قیمت درهم (AED)',
  usdPrice: 'قیمت دلار (USD)',
  partnerPrice: 'قیمت همکار (ریال)',
  effectivePrice: 'قیمت مؤثر مشتری',
  priceUpdatedAt: 'آخرین محاسبه قیمت',
  priceStatus: 'وضعیت قیمت',
  productStatus: 'وضعیت محصول',
  condition: 'وضعیت کالا',
  created: 'تاریخ ایجاد',
  storefrontLink: 'لینک فروشگاه',
}

export const GRID_ALL_COLUMNS: GridColumnKey[] = [
  'thumbnail',
  'name',
  'variantName',
  'sku',
  'barcode',
  'brand',
  'category',
  'stock',
  'regularPrice',
  'discountedPrice',
  'discountWindow',
  'aedPrice',
  'usdPrice',
  'partnerPrice',
  'effectivePrice',
  'priceUpdatedAt',
  'priceStatus',
  'productStatus',
  'condition',
  'created',
  'storefrontLink',
]

/** Operational core — always rendered, never toggleable (actions too). */
export const GRID_FIXED_COLUMNS: GridColumnKey[] = [
  'name',
  'sku',
  'stock',
  'regularPrice',
  'discountedPrice',
  'effectivePrice',
  'priceUpdatedAt',
]

export const GRID_HIDEABLE_COLUMNS: GridColumnKey[] = GRID_ALL_COLUMNS.filter(
  (key) => !GRID_FIXED_COLUMNS.includes(key),
)

/**
 * Lean default view: the columns an operator needs at a glance fit a normal
 * desktop viewport without horizontal scrolling. Currency and audit columns
 * are one chip-click away.
 */
export const GRID_DEFAULT_COLUMNS: GridColumnKey[] = [
  'thumbnail',
  'name',
  'sku',
  'brand',
  'category',
  'stock',
  'regularPrice',
  'discountedPrice',
  'effectivePrice',
  'priceUpdatedAt',
  'priceStatus',
]

const VALID_KEYS = new Set<string>(GRID_ALL_COLUMNS)

export function readVisibleColumns(): GridColumnKey[] {
  try {
    const raw = localStorage.getItem(GRID_COLUMN_STORAGE_KEY)
    if (!raw) {
      return [...GRID_DEFAULT_COLUMNS]
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return [...GRID_DEFAULT_COLUMNS]
    }
    const stored = parsed.filter(
      (key): key is GridColumnKey => typeof key === 'string' && VALID_KEYS.has(key),
    )
    const missing = GRID_FIXED_COLUMNS.filter((key) => !stored.includes(key))
    return [...missing, ...stored].sort(
      (a, b) => GRID_ALL_COLUMNS.indexOf(a) - GRID_ALL_COLUMNS.indexOf(b),
    )
  } catch {
    return [...GRID_DEFAULT_COLUMNS]
  }
}

export function writeVisibleColumns(columns: GridColumnKey[]): void {
  try {
    localStorage.setItem(GRID_COLUMN_STORAGE_KEY, JSON.stringify(columns))
  } catch {
    // Persistence is best-effort; the grid still works without it.
  }
}
