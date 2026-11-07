/**
 * Column definitions + visibility persistence for the SS-257 catalog grid
 * (rendered as the products page).
 *
 * The operational core (product name, SKU, stock, both prices, row actions)
 * is never hideable, so an operator can always act on a row; informational
 * columns toggle via the checkbox column list. Preference lives in
 * localStorage — the same best-effort persistence the sidebar and theme use —
 * because it is a per-browser display concern, not user data.
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
  | 'salePrice'
  | 'priceStatus'
  | 'productStatus'
  | 'condition'
  | 'created'

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
  regularPrice: 'قیمت فروش',
  salePrice: 'قیمت قبل از تخفیف',
  priceStatus: 'وضعیت قیمت',
  productStatus: 'وضعیت محصول',
  condition: 'وضعیت کالا',
  created: 'تاریخ ایجاد',
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
  'salePrice',
  'priceStatus',
  'productStatus',
  'condition',
  'created',
]

/** Operational core — always rendered, never toggleable (actions too). */
export const GRID_FIXED_COLUMNS: GridColumnKey[] = [
  'name',
  'sku',
  'stock',
  'regularPrice',
  'salePrice',
]

export const GRID_HIDEABLE_COLUMNS: GridColumnKey[] = GRID_ALL_COLUMNS.filter(
  (key) => !GRID_FIXED_COLUMNS.includes(key),
)

/**
 * Lean default view: the columns an operator needs at a glance fit a normal
 * desktop viewport without horizontal scrolling. The rest (variant name,
 * barcode, product status, condition, created) are one chip-click away.
 */
export const GRID_DEFAULT_COLUMNS: GridColumnKey[] = [
  'thumbnail',
  'name',
  'sku',
  'brand',
  'category',
  'stock',
  'regularPrice',
  'salePrice',
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
    // Fixed columns are always visible regardless of what was persisted.
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
