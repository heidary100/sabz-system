/**
 * Column definitions + visibility persistence for the SS-257 catalog grid.
 *
 * The operational core (name, SKU, stock, both prices, price status) is
 * never hideable, so an operator can always act on a row; only the
 * informational columns (thumbnail, brand, category) toggle. Preference
 * lives in localStorage — the same best-effort persistence the sidebar and
 * theme use — because it is a per-browser display concern, not user data.
 */

export type GridColumnKey =
  | 'thumbnail'
  | 'name'
  | 'sku'
  | 'brand'
  | 'category'
  | 'stock'
  | 'regularPrice'
  | 'salePrice'
  | 'priceStatus'

export const GRID_COLUMN_STORAGE_KEY = 'sabz-admin-catalog-grid-columns'

export const GRID_COLUMN_LABELS: Record<GridColumnKey, string> = {
  thumbnail: 'تصویر',
  name: 'نام محصول',
  sku: 'شناسه کالا (SKU)',
  brand: 'برند',
  category: 'دسته‌بندی',
  stock: 'موجودی',
  regularPrice: 'قیمت فروش',
  salePrice: 'قیمت فروش ویژه',
  priceStatus: 'وضعیت قیمت',
}

export const GRID_ALL_COLUMNS: GridColumnKey[] = [
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

/** Operational core — always rendered, never toggleable. */
export const GRID_FIXED_COLUMNS: GridColumnKey[] = [
  'name',
  'sku',
  'stock',
  'regularPrice',
  'salePrice',
  'priceStatus',
]

export const GRID_HIDEABLE_COLUMNS: GridColumnKey[] = ['thumbnail', 'brand', 'category']

const VALID_KEYS = new Set<string>(GRID_ALL_COLUMNS)

export function readVisibleColumns(): GridColumnKey[] {
  try {
    const raw = localStorage.getItem(GRID_COLUMN_STORAGE_KEY)
    if (!raw) {
      return [...GRID_ALL_COLUMNS]
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return [...GRID_ALL_COLUMNS]
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
    return [...GRID_ALL_COLUMNS]
  }
}

export function writeVisibleColumns(columns: GridColumnKey[]): void {
  try {
    localStorage.setItem(GRID_COLUMN_STORAGE_KEY, JSON.stringify(columns))
  } catch {
    // Persistence is best-effort; the grid still works without it.
  }
}
