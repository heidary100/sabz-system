import { useId, useState } from 'react'
import type { MerchCtaKind } from '@sabz/types'
import { Button } from '../../catalyst/button'
import { Description, Field, Label } from '../../catalyst/fieldset'
import { Select } from '../../catalyst/select'
import { FieldErrorMessage } from '../../ui/field-error'
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
  const uid = useId()
  const kindId = `campaign-cta-kind-${uid}`
  const kindDescriptionId = `${kindId}-description`
  const errorId = `${kindId}-error`
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
        <Label htmlFor={kindId}>فراخوان (CTA)</Label>
        <Select
          id={kindId}
          value={value.ctaKind}
          disabled={disabled}
          invalid={Boolean(error)}
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
        <Description className="text-xs text-muted" id={kindDescriptionId}>
          مقصد فراخوان باید از محتوای موجود و قابل نمایش انتخاب شود. متن دکمه در
          تنظیمات بالاتر وارد می‌شود.
        </Description>
        <FieldErrorMessage id={errorId} message={error} />
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
