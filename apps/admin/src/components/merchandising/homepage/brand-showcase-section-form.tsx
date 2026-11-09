import { useState } from 'react'
import type {
  BrandShowcaseSection,
  HomepageValidationIssue,
} from '@sabz/types'
import { MERCH_BRAND_SHOWCASE_MAX_BRANDS, MERCH_BRAND_SHOWCASE_MAX_PRODUCTS_PER_BRAND } from '@sabz/types'
import { Plus } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Field, Label } from '../../catalyst/fieldset'
import { Input } from '../../catalyst/input'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import { StatusBadge } from '../../ui/status-badge'
import { useMerchCampaignDetails } from '../../../hooks/use-merch-campaign-details'
import { firstValidationMessage } from '../../../lib/merchandising-homepage'
import { CampaignDetailHeader } from './campaign-section-common'
import { HomepageCampaignPickerDialog } from './homepage-campaign-picker-dialog'

const MIN_BRANDS = 1
const MAX_BRANDS = MERCH_BRAND_SHOWCASE_MAX_BRANDS

export function BrandShowcaseSectionForm({
  section,
  issues,
  basePath,
  disabled = false,
  onSettingsChange,
}: {
  section: BrandShowcaseSection
  issues: HomepageValidationIssue[]
  basePath: string
  disabled?: boolean
  onSettingsChange: (settings: BrandShowcaseSection['settings']) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const { campaignId, productsPerBrand } = section.settings
  const { details, loading, errors } = useMerchCampaignDetails(
    campaignId ? [campaignId] : [],
  )
  const detail = campaignId ? details[campaignId] : undefined
  const brandCount = detail?.brands.length ?? 0
  const brandCountValid =
    brandCount >= MIN_BRANDS && brandCount <= MAX_BRANDS
  const campaignError = firstValidationMessage(issues, basePath, 'campaignId')
  const productsError = firstValidationMessage(
    issues,
    basePath,
    'productsPerBrand',
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            کمپین ویترین برند
          </p>
          <Text className="text-xs text-muted">
            برندها از ارتباط‌های همین کمپین خوانده می‌شوند؛ این فرم ارتباط‌های
            کمپین را تغییر نمی‌دهد.
          </Text>
        </div>
        <Button outline disabled={disabled} onClick={() => setPickerOpen(true)}>
          <Plus data-slot="icon" />
          {campaignId ? 'تغییر کمپین' : 'انتخاب کمپین'}
        </Button>
      </div>

      {!campaignId ? (
        <Text className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-6 text-center text-sm text-warning">
          برای این بخش یک کمپین انتخاب کنید.
        </Text>
      ) : loading[campaignId] ? (
        <Text className="text-xs text-muted" role="status">
          در حال بارگذاری جزئیات کمپین…
        </Text>
      ) : errors[campaignId] ? (
        <InlineError message={errors[campaignId]!} />
      ) : detail ? (
        <div className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
          <CampaignDetailHeader campaign={detail} />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={brandCountValid ? 'success' : 'danger'}>
              {brandCount.toLocaleString('fa-IR')} برند
            </StatusBadge>
            <Text className="text-xs text-muted">
              محدوده مجاز: ۱ تا {MAX_BRANDS.toLocaleString('fa-IR')} برند
            </Text>
          </div>
          {detail.brands.length === 0 ? (
            <Text className="text-sm text-danger">
              این کمپین برندی ندارد؛ برای معتبر بودن ویترین برند، ۱ تا ۵ برند در
              کمپین تعیین کنید.
            </Text>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {detail.brands.map((brand) => (
                <li key={brand.id}>
                  <StatusBadge tone="neutral">{brand.name}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
          {brandCount > MAX_BRANDS && (
            <Text className="text-sm text-danger">
              این کمپین {brandCount.toLocaleString('fa-IR')} برند دارد؛ حداکثر{' '}
              {MAX_BRANDS.toLocaleString('fa-IR')} برند برای این بخش مجاز است.
            </Text>
          )}
        </div>
      ) : null}

      <Field>
        <Label htmlFor="brand-showcase-products-per-brand">
          تعداد محصول هر برند
        </Label>
        <Input
          id="brand-showcase-products-per-brand"
          type="number"
          min={1}
          max={MERCH_BRAND_SHOWCASE_MAX_PRODUCTS_PER_BRAND}
          value={productsPerBrand}
          disabled={disabled}
          onChange={(event) =>
            onSettingsChange({
              ...section.settings,
              productsPerBrand: Number(event.target.value),
            })
          }
        />
        <Text className="text-xs text-muted">
          ۱ تا {MERCH_BRAND_SHOWCASE_MAX_PRODUCTS_PER_BRAND.toLocaleString('fa-IR')} محصول
        </Text>
        {productsError && (
          <Text className="text-sm text-danger">{productsError}</Text>
        )}
      </Field>

      {campaignError && (
        <Text className="text-sm text-danger">{campaignError}</Text>
      )}

      <HomepageCampaignPickerDialog
        open={pickerOpen}
        selectedIds={campaignId ? [campaignId] : []}
        maxReached={false}
        pickLabel="انتخاب"
        onPick={(campaign) => {
          onSettingsChange({ ...section.settings, campaignId: campaign.id })
          setPickerOpen(false)
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
