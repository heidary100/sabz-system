import { useEffect, useState } from 'react'
import type {
  CategorySpotlightSection,
  HomepageValidationIssue,
} from '@sabz/types'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Field, Label } from '../../catalyst/fieldset'
import { Select } from '../../catalyst/select'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import { StatusBadge } from '../../ui/status-badge'
import { useMerchCampaignDetails } from '../../../hooks/use-merch-campaign-details'
import { firstValidationMessage } from '../../../lib/merchandising-homepage'
import { merchandisingErrorMessage } from '../../../lib/merchandising-errors'
import { getCategory } from '../../../services/categories'
import { CampaignDetailHeader, CampaignCategorySummary } from './campaign-section-common'
import { CampaignCategoryPickerDialog } from '../../merchandising/campaigns/campaign-category-picker-dialog'
import { HomepageCampaignPickerDialog } from './homepage-campaign-picker-dialog'

export function CategorySpotlightSectionForm({
  section,
  issues,
  basePath,
  disabled = false,
  onSettingsChange,
}: {
  section: CategorySpotlightSection
  issues: HomepageValidationIssue[]
  basePath: string
  disabled?: boolean
  onSettingsChange: (settings: CategorySpotlightSection['settings']) => void
}) {
  const [campaignPickerOpen, setCampaignPickerOpen] = useState(false)
  const [secondaryPickerOpen, setSecondaryPickerOpen] = useState(false)
  const [secondaryName, setSecondaryName] = useState<string | null>(null)
  const [secondaryError, setSecondaryError] = useState<string | null>(null)
  const { campaignId, categoryId, secondaryCategoryId } = section.settings
  const { details, loading, errors } = useMerchCampaignDetails(
    campaignId ? [campaignId] : [],
  )
  const detail = campaignId ? details[campaignId] : undefined
  const campaignError = firstValidationMessage(issues, basePath, 'campaignId')
  const categoryError = firstValidationMessage(issues, basePath, 'categoryId')
  const secondaryFieldError = firstValidationMessage(
    issues,
    basePath,
    'secondaryCategoryId',
  )

  useEffect(() => {
    if (!secondaryCategoryId) {
      setSecondaryName(null)
      setSecondaryError(null)
      return
    }
    const fromCampaign = detail?.categories.find(
      (category) => category.id === secondaryCategoryId,
    )
    if (fromCampaign) {
      setSecondaryName(fromCampaign.name)
      return
    }
    let cancelled = false
    setSecondaryName(null)
    setSecondaryError(null)
    void getCategory(secondaryCategoryId)
      .then((category) => {
        if (!cancelled) {
          setSecondaryName(category.name)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSecondaryError(merchandisingErrorMessage(error))
        }
      })
    return () => {
      cancelled = true
    }
  }, [secondaryCategoryId, detail])

  const categories = detail?.categories ?? []
  const primaryInvalid =
    categoryId !== '' && !categories.some((category) => category.id === categoryId)
  const secondarySameAsPrimary =
    secondaryCategoryId !== null && secondaryCategoryId === categoryId

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            کمپین و دسته‌بندی ویژه
          </p>
          <Text className="text-xs text-muted">
            دسته‌بندی اصلی باید از دسته‌بندی‌های همین کمپین باشد. دسته‌بندی
            ثانویه اختیاری، متمایز و قابل نمایش است.
          </Text>
        </div>
        <Button
          outline
          disabled={disabled}
          onClick={() => setCampaignPickerOpen(true)}
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
          <CampaignCategorySummary
            campaign={detail}
            emptyMessage="این کمپین دسته‌بندی ندارد؛ ابتدا از ویرایشگر کمپین دسته‌بندی اضافه کنید."
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <Label htmlFor="spotlight-primary-category">دسته‌بندی اصلی</Label>
          <Select
            id="spotlight-primary-category"
            value={categoryId}
            disabled={disabled || categories.length === 0}
            onChange={(event) =>
              onSettingsChange({
                ...section.settings,
                categoryId: event.target.value,
                secondaryCategoryId:
                  secondaryCategoryId === event.target.value
                    ? null
                    : secondaryCategoryId,
              })
            }
          >
            <option value="">انتخاب دسته‌بندی اصلی</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          {categories.length === 0 && (
            <Text className="text-xs text-warning">
              تا زمانی که کمپین دسته‌بندی نداشته باشد، این بخش معتبر نیست.
            </Text>
          )}
          {(categoryError || primaryInvalid) && (
            <Text className="text-sm text-danger">
              {categoryError ??
                'دسته‌بندی اصلی باید یکی از دسته‌بندی‌های کمپین باشد.'}
            </Text>
          )}
        </Field>

        <Field>
          <Label>دسته‌بندی ثانویه (اختیاری)</Label>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                outline
                disabled={disabled}
                onClick={() => setSecondaryPickerOpen(true)}
              >
                {secondaryCategoryId
                  ? 'تغییر دسته‌بندی ثانویه'
                  : 'انتخاب دسته‌بندی ثانویه'}
              </Button>
              {secondaryCategoryId && (
                <Button
                  plain
                  disabled={disabled}
                  onClick={() =>
                    onSettingsChange({
                      ...section.settings,
                      secondaryCategoryId: null,
                    })
                  }
                >
                  <Trash2 data-slot="icon" />
                  حذف
                </Button>
              )}
            </div>
            <Text className="text-xs text-muted">
              {secondaryCategoryId
                ? secondaryName ?? 'در حال بارگذاری نام دسته‌بندی…'
                : 'بدون دسته‌بندی ثانویه'}
            </Text>
            {secondaryError && <InlineError message={secondaryError} />}
            {(secondaryFieldError || secondarySameAsPrimary) && (
              <Text className="text-sm text-danger">
                {secondaryFieldError ??
                  'دسته‌بندی ثانویه باید با دسته‌بندی اصلی متفاوت باشد.'}
              </Text>
            )}
            {secondarySameAsPrimary && !secondaryFieldError && (
              <StatusBadge tone="danger">
                دسته‌بندی ثانویه با اصلی یکسان است
              </StatusBadge>
            )}
          </div>
        </Field>
      </div>

      {campaignError && (
        <Text className="text-sm text-danger">{campaignError}</Text>
      )}

      <HomepageCampaignPickerDialog
        open={campaignPickerOpen}
        selectedIds={campaignId ? [campaignId] : []}
        maxReached={false}
        pickLabel="انتخاب"
        onPick={(campaign) => {
          onSettingsChange({
            campaignId: campaign.id,
            categoryId: '',
            secondaryCategoryId: null,
          })
          setCampaignPickerOpen(false)
        }}
        onClose={() => setCampaignPickerOpen(false)}
      />
      <CampaignCategoryPickerDialog
        open={secondaryPickerOpen}
        selectedIds={categoryId ? [categoryId] : []}
        maxReached={false}
        pickLabel="انتخاب"
        onPick={(category) => {
          onSettingsChange({
            ...section.settings,
            secondaryCategoryId: category.id,
          })
          setSecondaryName(category.name)
          setSecondaryPickerOpen(false)
        }}
        onClose={() => setSecondaryPickerOpen(false)}
      />
    </div>
  )
}
