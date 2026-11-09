import { useState } from 'react'
import type {
  HeroCarouselSection,
  HomepageValidationIssue,
} from '@sabz/types'
import { MERCH_HERO_MAX_SLIDES } from '@sabz/types'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import { StatusBadge } from '../../ui/status-badge'
import { useMerchCampaignDetails } from '../../../hooks/use-merch-campaign-details'
import { firstValidationMessage } from '../../../lib/merchandising-homepage'
import {
  CampaignCategorySummary,
  CampaignDetailHeader,
  CampaignMediaSummary,
} from './campaign-section-common'
import { HomepageCampaignPickerDialog } from './homepage-campaign-picker-dialog'

export function HeroCarouselSectionForm({
  section,
  issues,
  basePath,
  disabled = false,
  onSettingsChange,
}: {
  section: HeroCarouselSection
  issues: HomepageValidationIssue[]
  basePath: string
  disabled?: boolean
  onSettingsChange: (settings: HeroCarouselSection['settings']) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const campaignIds = section.settings.campaignIds
  const { details, loading, errors } = useMerchCampaignDetails(campaignIds)
  const maxReached = campaignIds.length >= MERCH_HERO_MAX_SLIDES

  const update = (next: string[]): void => {
    onSettingsChange({ campaignIds: next })
  }
  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= campaignIds.length) {
      return
    }
    const next = [...campaignIds]
    const [id] = next.splice(index, 1)
    next.splice(target, 0, id!)
    update(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            اسلایدهای هیرو ({campaignIds.length.toLocaleString('fa-IR')} از{' '}
            {MERCH_HERO_MAX_SLIDES.toLocaleString('fa-IR')})
          </p>
          <Text className="text-xs text-muted">
            حداقل یک و حداکثر سه کمپین. هر کمپین برای اسلاید هیرو به رسانه
            HERO_DESKTOP نیاز دارد.
          </Text>
        </div>
        <Button
          outline
          disabled={disabled || maxReached}
          onClick={() => setPickerOpen(true)}
        >
          <Plus data-slot="icon" />
          افزودن کمپین
        </Button>
      </div>

      {campaignIds.length === 0 && (
        <Text className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-6 text-center text-sm text-warning">
          برای این بخش حداقل یک کمپین انتخاب کنید.
        </Text>
      )}

      <ol className="space-y-3">
        {campaignIds.map((campaignId, index) => {
          const displayIndex = (index + 1).toLocaleString('fa-IR')
          const detail = details[campaignId]
          const itemError =
            issues.find(
              (issue) =>
                issue.path === `${basePath}.campaignIds[${index}]`,
            )?.message ?? null
          const mediaError = firstValidationMessage(
            issues,
            basePath,
            `campaignIds[${index}].media`,
          )
          const hasDesktop = detail?.media.some(
            (media) => media.slot === 'HERO_DESKTOP',
          )
          const hasMobile = detail?.media.some(
            (media) => media.slot === 'HERO_MOBILE',
          )
          return (
            <li
              key={campaignId}
              className="space-y-3 rounded-xl border border-border bg-background/40 p-3"
            >
              <div className="flex flex-wrap items-start gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-strong text-xs font-semibold tabular-nums text-foreground">
                  {displayIndex}
                </span>
                {detail ? (
                  <CampaignDetailHeader campaign={detail} />
                ) : loading[campaignId] ? (
                  <p className="text-xs text-muted" role="status">
                    در حال بارگذاری جزئیات کمپین…
                  </p>
                ) : (
                  <p className="text-xs text-muted" dir="ltr">
                    {campaignId}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <Button
                    plain
                    aria-label={`جابه‌جایی کمپین ${displayIndex} به بالا`}
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp data-slot="icon" />
                  </Button>
                  <Button
                    plain
                    aria-label={`جابه‌جایی کمپین ${displayIndex} به پایین`}
                    disabled={disabled || index === campaignIds.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown data-slot="icon" />
                  </Button>
                  <Button
                    plain
                    aria-label={`حذف کمپین ${displayIndex}`}
                    disabled={disabled}
                    onClick={() =>
                      update(campaignIds.filter((id) => id !== campaignId))
                    }
                  >
                    <Trash2 data-slot="icon" />
                  </Button>
                </div>
              </div>

              {errors[campaignId] && <InlineError message={errors[campaignId]!} />}
              {itemError && <Text className="text-sm text-danger">{itemError}</Text>}

              {detail && (
                <>
                  <CampaignCategorySummary campaign={detail} />
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={hasDesktop ? 'success' : 'danger'}>
                          {hasDesktop
                            ? 'رسانه دسکتاپ موجود است'
                            : 'رسانه دسکتاپ ندارد'}
                        </StatusBadge>
                        <StatusBadge tone={hasMobile ? 'success' : 'warning'}>
                          {hasMobile
                            ? 'رسانه موبایل موجود است'
                            : 'رسانه موبایل ندارد'}
                        </StatusBadge>
                      </div>
                      {!hasDesktop && (
                        <Text className="text-xs text-danger">
                          برای این اسلاید، رسانه HERO_DESKTOP در کمپین الزامی
                          است. آن را در ویرایشگر کمپین اضافه کنید.
                        </Text>
                      )}
                      {hasDesktop && !hasMobile && (
                        <Text className="text-xs text-warning">
                          رسانه HERO_MOBILE تعیین نشده است؛ نسخه دسکتاپ به‌عنوان
                          جایگزین استفاده می‌شود.
                        </Text>
                      )}
                      {mediaError && (
                        <Text className="text-sm text-danger">{mediaError}</Text>
                      )}
                    </div>
                    <CampaignMediaSummary campaign={detail} compact />
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ol>

      <HomepageCampaignPickerDialog
        open={pickerOpen}
        selectedIds={campaignIds}
        maxReached={maxReached}
        onPick={(campaign) => {
          if (!campaignIds.includes(campaign.id)) {
            update([...campaignIds, campaign.id])
          }
          setPickerOpen(false)
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
