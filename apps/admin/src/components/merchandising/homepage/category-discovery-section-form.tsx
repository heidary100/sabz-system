import { useId, useState } from 'react'
import type {
  CategoryDiscoverySection,
  HomepageValidationIssue,
} from '@sabz/types'
import { Plus } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'
import { FieldError } from '../../ui/field-error'
import { InlineError } from '../../ui/inline-error'
import { StatusBadge } from '../../ui/status-badge'
import { useMerchCampaignDetails } from '../../../hooks/use-merch-campaign-details'
import { firstValidationMessage } from '../../../lib/merchandising-homepage'
import {
  CampaignCategorySummary,
  CampaignDetailHeader,
} from './campaign-section-common'
import { HomepageCampaignPickerDialog } from './homepage-campaign-picker-dialog'

const MIN_CATEGORIES = 1
const MAX_CATEGORIES = 6

export function CategoryDiscoverySectionForm({
  section,
  issues,
  basePath,
  disabled = false,
  onSettingsChange,
}: {
  section: CategoryDiscoverySection
  issues: HomepageValidationIssue[]
  basePath: string
  disabled?: boolean
  onSettingsChange: (settings: CategoryDiscoverySection['settings']) => void
}) {
  const uid = useId()
  const campaignErrorId = `category-discovery-${uid}-campaign-error`
  const [pickerOpen, setPickerOpen] = useState(false)
  const campaignId = section.settings.campaignId
  const { details, loading, errors } = useMerchCampaignDetails(
    campaignId ? [campaignId] : [],
  )
  const detail = campaignId ? details[campaignId] : undefined
  const categoryCount = detail?.categories.length ?? 0
  const categoryCountValid =
    categoryCount >= MIN_CATEGORIES && categoryCount <= MAX_CATEGORIES
  const fieldError = firstValidationMessage(issues, basePath, 'campaignId')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            کمپین کشف دسته‌بندی
          </p>
          <Text className="text-xs text-muted">
            کمپین باید بین ۱ تا ۶ دسته‌بندی داشته باشد. دسته‌بندی‌ها فقط از
            ویرایشگر کمپین مدیریت می‌شوند.
          </Text>
        </div>
        <Button
          outline
          disabled={disabled}
          aria-describedby={fieldError ? campaignErrorId : undefined}
          onClick={() => setPickerOpen(true)}
        >
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
            <StatusBadge tone={categoryCountValid ? 'success' : 'danger'}>
              {categoryCount.toLocaleString('fa-IR')} دسته‌بندی
            </StatusBadge>
            <Text className="text-xs text-muted">
              محدوده مجاز: ۱ تا ۶ دسته‌بندی
            </Text>
          </div>
          <CampaignCategorySummary
            campaign={detail}
            emptyMessage="این کمپین دسته‌بندی ندارد؛ بخش کشف دسته‌بندی تا افزودن ۱ تا ۶ دسته‌بندی در کمپین معتبر نیست."
          />
          {!categoryCountValid && (
            <Text className="text-sm text-danger">
              این کمپین {categoryCount.toLocaleString('fa-IR')} دسته‌بندی دارد؛
              برای این بخش باید بین ۱ تا ۶ دسته‌بندی داشته باشد. ارتباط‌های
              کمپین را از ویرایشگر کمپین اصلاح کنید.
            </Text>
          )}
        </div>
      ) : null}

      <FieldError id={campaignErrorId} message={fieldError} />

      <HomepageCampaignPickerDialog
        open={pickerOpen}
        selectedIds={campaignId ? [campaignId] : []}
        maxReached={false}
        pickLabel="انتخاب"
        onPick={(campaign) => {
          onSettingsChange({ campaignId: campaign.id })
          setPickerOpen(false)
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
