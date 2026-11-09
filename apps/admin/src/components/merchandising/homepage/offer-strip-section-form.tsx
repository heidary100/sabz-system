import { useState } from 'react'
import type {
  HomepageValidationIssue,
  OfferStripSection,
} from '@sabz/types'
import { Plus } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Field, Label } from '../../catalyst/fieldset'
import { Select } from '../../catalyst/select'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import { StatusBadge } from '../../ui/status-badge'
import { useMerchCampaignDetails } from '../../../hooks/use-merch-campaign-details'
import { firstValidationMessage } from '../../../lib/merchandising-homepage'
import { CampaignDetailHeader } from './campaign-section-common'
import { HomepageCampaignPickerDialog } from './homepage-campaign-picker-dialog'

export function OfferStripSectionForm({
  section,
  issues,
  basePath,
  disabled = false,
  onSettingsChange,
}: {
  section: OfferStripSection
  issues: HomepageValidationIssue[]
  basePath: string
  disabled?: boolean
  onSettingsChange: (settings: OfferStripSection['settings']) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const { campaignId, fallback } = section.settings
  const { details, loading, errors } = useMerchCampaignDetails(
    campaignId ? [campaignId] : [],
  )
  const detail = campaignId ? details[campaignId] : undefined
  const campaignError = firstValidationMessage(issues, basePath, 'campaignId')
  const fallbackError = firstValidationMessage(issues, basePath, 'fallback')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            کمپین نوار پیشنهاد
          </p>
          <Text className="text-xs text-muted">
            نوار پیشنهاد از محصولات کمپین استفاده می‌کند؛ ارتباط‌های کمپین در
            این فرم تغییر نمی‌کنند.
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
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="neutral">
              {detail.products.length.toLocaleString('fa-IR')} محصول
            </StatusBadge>
            <StatusBadge tone="neutral">
              {detail.categories.length.toLocaleString('fa-IR')} دسته‌بندی
            </StatusBadge>
            <StatusBadge tone="neutral">
              {detail.brands.length.toLocaleString('fa-IR')} برند
            </StatusBadge>
            <StatusBadge tone="neutral">
              {detail.media.length.toLocaleString('fa-IR')} رسانه
            </StatusBadge>
          </div>
        </div>
      ) : null}

      <Field>
        <Label htmlFor="offer-strip-fallback">رفتار جایگزین</Label>
        <Select
          id="offer-strip-fallback"
          value={fallback}
          disabled={disabled}
          onChange={(event) =>
            onSettingsChange({
              ...section.settings,
              fallback: event.target.value as OfferStripSection['settings']['fallback'],
            })
          }
        >
          <option value="featured">نمایش محصولات منتخب</option>
          <option value="hide">پنهان کردن بخش</option>
        </Select>
        <Text className="text-xs text-muted">
          «نمایش محصولات منتخب» وقتی پیشنهاد فعالی وجود ندارد محصولات منتخب را
          نشان می‌دهد؛ «پنهان کردن بخش» نوار را در آن حالت نمایش نمی‌دهد.
        </Text>
        {fallbackError && (
          <Text className="text-sm text-danger">{fallbackError}</Text>
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
