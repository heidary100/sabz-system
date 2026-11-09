import { useState } from 'react'
import type { MerchCtaKind } from '@sabz/types'
import { Button } from '../../catalyst/button'
import { Field, Label } from '../../catalyst/fieldset'
import { Select } from '../../catalyst/select'
import { Text } from '../../catalyst/text'
import {
  MERCH_CTA_KIND_LABELS,
  MERCH_CTA_KIND_ORDER,
} from '../../../lib/merchandising-labels'
import type { OrderedEntityItem } from './campaign-ordered-entity-list'
import { CampaignProductPickerDialog } from './campaign-product-picker-dialog'
import { CampaignCategoryPickerDialog } from './campaign-category-picker-dialog'
import { CampaignBrandPickerDialog } from './campaign-brand-picker-dialog'

interface CtaValue {
  ctaKind: MerchCtaKind
  ctaProductId: string
  ctaCategoryId: string
  ctaBrandId: string
}

export function CampaignCtaBuilder({
  value,
  knownProducts,
  knownCategories,
  knownBrands,
  disabled = false,
  error,
  onChange,
}: {
  value: CtaValue
  knownProducts: OrderedEntityItem[]
  knownCategories: OrderedEntityItem[]
  knownBrands: OrderedEntityItem[]
  disabled?: boolean
  error?: string
  onChange: (next: CtaValue) => void
}) {
  const [picker, setPicker] = useState<'product' | 'category' | 'brand' | null>(
    null,
  )

  const targetLabel =
    value.ctaKind === 'PRODUCT'
      ? knownProducts.find((item) => item.id === value.ctaProductId)?.label ??
        value.ctaProductId
      : value.ctaKind === 'CATEGORY'
        ? knownCategories.find((item) => item.id === value.ctaCategoryId)
            ?.label ?? value.ctaCategoryId
        : value.ctaKind === 'BRAND'
          ? knownBrands.find((item) => item.id === value.ctaBrandId)?.label ??
            value.ctaBrandId
          : ''

  const kindTarget =
    value.ctaKind === 'PRODUCT'
      ? 'محصول'
      : value.ctaKind === 'CATEGORY'
        ? 'دسته‌بندی'
        : value.ctaKind === 'BRAND'
          ? 'برند'
          : ''

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <Field>
        <Label htmlFor="campaign-cta-kind">فراخوان (CTA)</Label>
        <Select
          id="campaign-cta-kind"
          value={value.ctaKind}
          disabled={disabled}
          onChange={(event) => {
            const ctaKind = event.target.value as MerchCtaKind
            onChange({
              ctaKind,
              ctaProductId: '',
              ctaCategoryId: '',
              ctaBrandId: '',
            })
          }}
        >
          {MERCH_CTA_KIND_ORDER.map((kind) => (
            <option key={kind} value={kind}>
              {MERCH_CTA_KIND_LABELS[kind]}
            </option>
          ))}
        </Select>
      </Field>

      {(value.ctaKind === 'PRODUCT' ||
        value.ctaKind === 'CATEGORY' ||
        value.ctaKind === 'BRAND') && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted">مقصد {kindTarget}</p>
            <p
              className="truncate text-sm text-foreground"
              title={targetLabel || undefined}
            >
              {targetLabel || 'مقصدی انتخاب نشده است.'}
            </p>
          </div>
          <Button
            outline
            disabled={disabled}
            onClick={() =>
              setPicker(
                value.ctaKind === 'PRODUCT'
                  ? 'product'
                  : value.ctaKind === 'CATEGORY'
                    ? 'category'
                    : 'brand',
              )
            }
          >
            انتخاب {kindTarget}
          </Button>
        </div>
      )}

      {error && <Text className="text-sm text-danger">{error}</Text>}
      <Text className="text-xs text-muted">
        مقصد فراخوان باید از محتوای موجود و قابل نمایش انتخاب شود. متن دکمه در
        تنظیمات بالاتر وارد می‌شود.
      </Text>

      <CampaignProductPickerDialog
        open={picker === 'product'}
        selectedIds={
          value.ctaProductId ? [value.ctaProductId] : []
        }
        maxReached={false}
        pickLabel="انتخاب"
        onPick={(product) => {
          onChange({
            ...value,
            ctaProductId: product.id,
          })
          setPicker(null)
        }}
        onClose={() => setPicker(null)}
      />
      <CampaignCategoryPickerDialog
        open={picker === 'category'}
        selectedIds={
          value.ctaCategoryId ? [value.ctaCategoryId] : []
        }
        maxReached={false}
        pickLabel="انتخاب"
        onPick={(category) => {
          onChange({
            ...value,
            ctaCategoryId: category.id,
          })
          setPicker(null)
        }}
        onClose={() => setPicker(null)}
      />
      <CampaignBrandPickerDialog
        open={picker === 'brand'}
        selectedIds={value.ctaBrandId ? [value.ctaBrandId] : []}
        maxReached={false}
        pickLabel="انتخاب"
        onPick={(brand) => {
          onChange({
            ...value,
            ctaBrandId: brand.id,
          })
          setPicker(null)
        }}
        onClose={() => setPicker(null)}
      />
    </div>
  )
}
