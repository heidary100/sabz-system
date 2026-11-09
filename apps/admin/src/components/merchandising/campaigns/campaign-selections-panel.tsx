import { useState } from 'react'
import type {
  BrandSummary,
  CategoryTreeNode,
  ProductSummary,
} from '@sabz/types'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'
import {
  MERCH_CAMPAIGN_MAX_BRANDS,
  MERCH_CAMPAIGN_MAX_CATEGORIES,
  MERCH_CAMPAIGN_MAX_PRODUCTS,
} from '@sabz/types'
import type {
  CampaignFormErrors,
  CampaignFormState,
} from '../../../lib/merchandising-campaign'
import { CampaignOrderedEntityList } from './campaign-ordered-entity-list'
import { CampaignProductPickerDialog } from './campaign-product-picker-dialog'
import { CampaignCategoryPickerDialog } from './campaign-category-picker-dialog'
import { CampaignBrandPickerDialog } from './campaign-brand-picker-dialog'

export interface CampaignSelectionMeta {
  products: Record<string, { name: string; slug: string; brandName?: string | null }>
  categories: Record<string, { name: string; slug: string }>
  brands: Record<string, { name: string; slug: string }>
}

type Picker = 'product' | 'category' | 'brand' | null

export function CampaignSelectionsPanel({
  form,
  meta,
  errors,
  disabled = false,
  onChange,
  onAddProduct,
  onAddCategory,
  onAddBrand,
}: {
  form: CampaignFormState
  meta: CampaignSelectionMeta
  errors: CampaignFormErrors
  disabled?: boolean
  onChange: (next: CampaignFormState) => void
  onAddProduct: (product: ProductSummary) => void
  onAddCategory: (category: CategoryTreeNode) => void
  onAddBrand: (brand: BrandSummary) => void
}) {
  const [picker, setPicker] = useState<Picker>(null)

  const updateIds = (
    key: 'productIds' | 'categoryIds' | 'brandIds',
    values: string[],
  ): void => {
    onChange({ ...form, [key]: values })
  }

  const move = (
    key: 'productIds' | 'categoryIds' | 'brandIds',
    id: string,
    direction: -1 | 1,
  ): void => {
    const values = form[key]
    const index = values.indexOf(id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= values.length) {
      return
    }
    const next = [...values]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    updateIds(key, next)
  }

  const remove = (
    key: 'productIds' | 'categoryIds' | 'brandIds',
    id: string,
  ): void => {
    updateIds(
      key,
      form[key].filter((value) => value !== id),
    )
  }

  const products = form.productIds.map((id) => ({
    id,
    label: meta.products[id]?.name ?? id,
    secondary: meta.products[id]?.slug ?? null,
  }))
  const categories = form.categoryIds.map((id) => ({
    id,
    label: meta.categories[id]?.name ?? id,
    secondary: meta.categories[id]?.slug ?? null,
  }))
  const brands = form.brandIds.map((id) => ({
    id,
    label: meta.brands[id]?.name ?? id,
    secondary: meta.brands[id]?.slug ?? null,
  }))

  return (
    <div className="space-y-6">
      <Text className="text-sm text-muted">
        ترتیب انتخاب‌ها در کمپین و نسخه منتشرشده حفظ می‌شود. نوع کمپین در
        backend محدودیتی برای ترکیب محصول، دسته‌بندی یا برند اعمال نمی‌کند.
      </Text>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              محصولات ({products.length.toLocaleString('fa-IR')} از{' '}
              {MERCH_CAMPAIGN_MAX_PRODUCTS.toLocaleString('fa-IR')})
            </h2>
            <Text className="text-xs text-muted">
              فقط محصولات منتشرشده قابل انتخاب‌اند.
            </Text>
          </div>
          <Button
            outline
            disabled={disabled || products.length >= MERCH_CAMPAIGN_MAX_PRODUCTS}
            onClick={() => setPicker('product')}
          >
            افزودن محصول
          </Button>
        </div>
        <CampaignOrderedEntityList
          items={products}
          emptyLabel="محصولی انتخاب نشده است."
          disabled={disabled}
          onMove={(id, direction) => move('productIds', id, direction)}
          onRemove={(id) => remove('productIds', id)}
        />
        {errors.products && (
          <Text className="text-sm text-danger">{errors.products}</Text>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              دسته‌بندی‌ها ({categories.length.toLocaleString('fa-IR')} از{' '}
              {MERCH_CAMPAIGN_MAX_CATEGORIES.toLocaleString('fa-IR')})
            </h2>
            <Text className="text-xs text-muted">
              دسته‌بندی‌های پنهان در فروشگاه قابل انتخاب نیستند.
            </Text>
          </div>
          <Button
            outline
            disabled={
              disabled || categories.length >= MERCH_CAMPAIGN_MAX_CATEGORIES
            }
            onClick={() => setPicker('category')}
          >
            افزودن دسته‌بندی
          </Button>
        </div>
        <CampaignOrderedEntityList
          items={categories}
          emptyLabel="دسته‌بندی‌ای انتخاب نشده است."
          disabled={disabled}
          onMove={(id, direction) => move('categoryIds', id, direction)}
          onRemove={(id) => remove('categoryIds', id)}
        />
        {errors.categories && (
          <Text className="text-sm text-danger">{errors.categories}</Text>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              برندها ({brands.length.toLocaleString('fa-IR')} از{' '}
              {MERCH_CAMPAIGN_MAX_BRANDS.toLocaleString('fa-IR')})
            </h2>
            <Text className="text-xs text-muted">
              فهرست برندها صفحه‌بندی می‌شود؛ جستجوی سروری برای برندها وجود
              ندارد.
            </Text>
          </div>
          <Button
            outline
            disabled={disabled || brands.length >= MERCH_CAMPAIGN_MAX_BRANDS}
            onClick={() => setPicker('brand')}
          >
            افزودن برند
          </Button>
        </div>
        <CampaignOrderedEntityList
          items={brands}
          emptyLabel="برندی انتخاب نشده است."
          disabled={disabled}
          onMove={(id, direction) => move('brandIds', id, direction)}
          onRemove={(id) => remove('brandIds', id)}
        />
        {errors.brands && (
          <Text className="text-sm text-danger">{errors.brands}</Text>
        )}
      </section>

      <CampaignProductPickerDialog
        open={picker === 'product'}
        selectedIds={form.productIds}
        maxReached={products.length >= MERCH_CAMPAIGN_MAX_PRODUCTS}
        onPick={(product) => {
          if (!form.productIds.includes(product.id)) {
            onAddProduct(product)
          }
        }}
        onClose={() => setPicker(null)}
      />
      <CampaignCategoryPickerDialog
        open={picker === 'category'}
        selectedIds={form.categoryIds}
        maxReached={categories.length >= MERCH_CAMPAIGN_MAX_CATEGORIES}
        onPick={(category) => {
          if (!form.categoryIds.includes(category.id)) {
            onAddCategory(category)
          }
        }}
        onClose={() => setPicker(null)}
      />
      <CampaignBrandPickerDialog
        open={picker === 'brand'}
        selectedIds={form.brandIds}
        maxReached={brands.length >= MERCH_CAMPAIGN_MAX_BRANDS}
        onPick={(brand) => {
          if (!form.brandIds.includes(brand.id)) {
            onAddBrand(brand)
          }
        }}
        onClose={() => setPicker(null)}
      />
    </div>
  )
}
