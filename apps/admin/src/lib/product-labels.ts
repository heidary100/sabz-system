import type { ProductCondition, ProductMediaType, ProductStatus } from '@sabz/types'

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشرشده',
  ARCHIVED: 'آرشیوشده',
}

export const PRODUCT_STATUS_ORDER: ProductStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED']

export const PRODUCT_CONDITION_LABELS: Record<ProductCondition, string> = {
  NEW: 'نو',
  OPEN_BOX: 'جعبه‌باز',
  REFURBISHED: 'بازسازی‌شده',
  USED: 'کارکرده',
  STOCK_CLEARANCE: 'تسویه موجودی',
}

export const PRODUCT_CONDITION_ORDER: ProductCondition[] = [
  'NEW',
  'OPEN_BOX',
  'REFURBISHED',
  'USED',
  'STOCK_CLEARANCE',
]

export const PRODUCT_MEDIA_TYPE_LABELS: Record<ProductMediaType, string> = {
  IMAGE: 'تصویر',
  VIDEO: 'ویدئو',
}
