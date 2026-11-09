import { useState } from 'react'
import type { MerchMediaSlot, MerchMediaStatus, MerchMediaSummaryDto } from '@sabz/types'
import { ChevronDown, ChevronUp, ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Field, Label } from '../../catalyst/fieldset'
import { Input } from '../../catalyst/input'
import { Select } from '../../catalyst/select'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import {
  MERCH_MEDIA_SLOT_LABELS,
  MERCH_MEDIA_SLOT_ORDER,
  mediaSlotLabel,
} from '../../../lib/merchandising-labels'
import {
  CAMPAIGN_MEDIA_ALT_MAX,
  type CampaignMediaDraft,
  type CampaignMediaItemErrors,
  mediaAssignmentKey,
} from '../../../lib/merchandising-campaign'
import { MerchMediaStatusBadge } from '../merch-media-status-badge'
import { MerchMediaThumbnail } from '../merch-media-thumbnail'
import { CampaignMediaPickerDialog } from './campaign-media-picker-dialog'

function nextUnusedSlot(
  mediaId: string,
  assignments: CampaignMediaDraft[],
): MerchMediaSlot | null {
  return (
    MERCH_MEDIA_SLOT_ORDER.find(
      (slot) =>
        !assignments.some(
          (item) => item.mediaId === mediaId && item.slot === slot,
        ),
    ) ?? null
  )
}

export function CampaignMediaAssignments({
  value,
  errors,
  disabled = false,
  maxMedia,
  onChange,
}: {
  value: CampaignMediaDraft[]
  errors?: Array<CampaignMediaItemErrors | undefined>
  disabled?: boolean
  maxMedia: number
  onChange: (next: CampaignMediaDraft[]) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const maxReached = value.length >= maxMedia

  const updateAt = (index: number, patch: Partial<CampaignMediaDraft>): void => {
    onChange(value.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item,
    ))
  }

  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction
    if (target < 0 || target >= value.length) {
      return
    }
    const next = [...value]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    onChange(next)
  }

  const addMedia = (media: MerchMediaSummaryDto): void => {
    if (value.length >= maxMedia) {
      setActionError(
        `حداکثر ${maxMedia.toLocaleString('fa-IR')} رسانه مجاز است.`,
      )
      return
    }
    const slot = nextUnusedSlot(media.id, value)
    if (!slot) {
      setActionError(
        'این رسانه در همه جایگاه‌های پشتیبانی‌شده اضافه شده است؛ جایگاه یکی از تخصیص‌ها را تغییر دهید.',
      )
      return
    }
    setActionError(null)
    onChange([
      ...value,
      {
        mediaId: media.id,
        originalName: media.originalName,
        mimeType: media.mimeType,
        publishedAt: media.publishedAt,
        slot,
        altFa: media.altFa ?? '',
        focalX: '50',
        focalY: '50',
      },
    ])
    setPickerOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Text className="text-sm text-foreground">
            رسانه‌های کمپین ({value.length.toLocaleString('fa-IR')} از{' '}
            {maxMedia.toLocaleString('fa-IR')})
          </Text>
          <Text className="text-xs text-muted">
            جایگاه، نقطه کانونی و متن جایگزین هر تخصیص در همین‌جا مدیریت
            می‌شود؛ متن جایگزین کتابخانه رسانه جداگانه است.
          </Text>
        </div>
        <Button
          outline
          disabled={disabled || maxReached}
          onClick={() => {
            setActionError(null)
            setPickerOpen(true)
          }}
        >
          <ImagePlus data-slot="icon" />
          افزودن رسانه
        </Button>
      </div>

      {actionError && <InlineError message={actionError} />}
      {errors && errors.some(Boolean) && !actionError && (
        <InlineError message="برخی تخصیص‌های رسانه معتبر نیستند؛ فیلدهای مشخص‌شده را بررسی کنید." />
      )}

      {value.length === 0 ? (
        <Text className="rounded-xl border border-dashed border-border bg-surface/50 px-4 py-8 text-center text-sm text-muted">
          رسانه‌ای به این کمپین تخصیص نیافته است.
        </Text>
      ) : (
        <ol className="space-y-3">
          {value.map((item, index) => {
            const itemErrors = errors?.[index]
            const status: MerchMediaStatus = item.publishedAt
              ? 'PUBLISHED'
              : 'DRAFT'
            const duplicate = value.some(
              (other, otherIndex) =>
                otherIndex < index &&
                mediaAssignmentKey(other.mediaId, other.slot) ===
                  mediaAssignmentKey(item.mediaId, item.slot),
            )
            return (
              <li
                key={`${item.mediaId}:${item.slot}:${index}`}
                className="rounded-xl border border-border bg-surface p-3"
              >
                <div className="flex flex-wrap gap-3">
                  <div className="size-28 shrink-0 overflow-hidden rounded-lg bg-surface-strong">
                    <MerchMediaThumbnail
                      mediaId={item.mediaId}
                      alt={item.altFa || item.originalName}
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <MerchMediaStatusBadge status={status} />
                      <p
                        dir="ltr"
                        className="min-w-0 flex-1 truncate text-start text-xs font-medium text-foreground"
                        title={item.originalName}
                      >
                        {item.originalName}
                      </p>
                      <span className="text-xs text-muted">
                        {item.mimeType}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field>
                        <Label htmlFor={`campaign-media-slot-${index}`}>
                          جایگاه
                        </Label>
                        <Select
                          id={`campaign-media-slot-${index}`}
                          value={item.slot}
                          disabled={disabled}
                          onChange={(event) =>
                            updateAt(index, {
                              slot: event.target.value as MerchMediaSlot,
                            })
                          }
                        >
                          {MERCH_MEDIA_SLOT_ORDER.map((slot) => (
                            <option key={slot} value={slot}>
                              {MERCH_MEDIA_SLOT_LABELS[slot]}
                            </option>
                          ))}
                        </Select>
                        {(itemErrors?.slot || duplicate) && (
                          <Text className="text-xs text-danger">
                            {itemErrors?.slot ??
                              'این رسانه در این جایگاه قبلاً انتخاب شده است.'}
                          </Text>
                        )}
                      </Field>
                      <Field>
                        <Label htmlFor={`campaign-media-focal-x-${index}`}>
                          نقطه کانونی افقی
                        </Label>
                        <Input
                          id={`campaign-media-focal-x-${index}`}
                          type="number"
                          min={0}
                          max={100}
                          value={item.focalX}
                          disabled={disabled}
                          onChange={(event) =>
                            updateAt(index, { focalX: event.target.value })
                          }
                        />
                        {itemErrors?.focalX && (
                          <Text className="text-xs text-danger">
                            {itemErrors.focalX}
                          </Text>
                        )}
                      </Field>
                      <Field>
                        <Label htmlFor={`campaign-media-focal-y-${index}`}>
                          نقطه کانونی عمودی
                        </Label>
                        <Input
                          id={`campaign-media-focal-y-${index}`}
                          type="number"
                          min={0}
                          max={100}
                          value={item.focalY}
                          disabled={disabled}
                          onChange={(event) =>
                            updateAt(index, { focalY: event.target.value })
                          }
                        />
                        {itemErrors?.focalY && (
                          <Text className="text-xs text-danger">
                            {itemErrors.focalY}
                          </Text>
                        )}
                      </Field>
                    </div>

                    <Field>
                      <Label htmlFor={`campaign-media-alt-${index}`}>
                        متن جایگزین تخصیص (اختیاری)
                      </Label>
                      <Input
                        id={`campaign-media-alt-${index}`}
                        value={item.altFa}
                        maxLength={CAMPAIGN_MEDIA_ALT_MAX}
                        disabled={disabled}
                        onChange={(event) =>
                          updateAt(index, { altFa: event.target.value })
                        }
                      />
                      <Text className="text-xs text-muted">
                        {item.altFa.length.toLocaleString('fa-IR')} از{' '}
                        {CAMPAIGN_MEDIA_ALT_MAX.toLocaleString('fa-IR')} کاراکتر
                      </Text>
                      {itemErrors?.altFa && (
                        <Text className="text-xs text-danger">
                          {itemErrors.altFa}
                        </Text>
                      )}
                    </Field>

                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        plain
                        aria-label={`جابه‌جایی ${item.originalName} به بالا`}
                        disabled={disabled || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ChevronUp data-slot="icon" />
                      </Button>
                      <Button
                        plain
                        aria-label={`جابه‌جایی ${item.originalName} به پایین`}
                        disabled={disabled || index === value.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ChevronDown data-slot="icon" />
                      </Button>
                      <Button
                        plain
                        aria-label={`حذف ${item.originalName}`}
                        disabled={disabled}
                        onClick={() =>
                          onChange(value.filter((_, itemIndex) => itemIndex !== index))
                        }
                      >
                        <Trash2 data-slot="icon" />
                      </Button>
                      <Text className="ms-auto text-xs text-muted">
                        جایگاه: {mediaSlotLabel(item.slot)}
                      </Text>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <CampaignMediaPickerDialog
        open={pickerOpen}
        maxReached={maxReached}
        onPick={addMedia}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
