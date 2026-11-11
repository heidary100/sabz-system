import { useEffect, useId, useRef, useState } from 'react'
import type { MerchMediaSlot, MerchMediaStatus, MerchMediaSummaryDto } from '@sabz/types'
import { ChevronDown, ChevronUp, ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Description, Field, Label } from '../../catalyst/fieldset'
import { Input } from '../../catalyst/input'
import { Select } from '../../catalyst/select'
import { Text } from '../../catalyst/text'
import { FieldErrorMessage } from '../../ui/field-error'
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
  const uid = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const pendingFocusIndex = useRef<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const maxReached = value.length >= maxMedia

  useEffect(() => {
    if (pendingFocusIndex.current === null) {
      return
    }
    const targetIndex = pendingFocusIndex.current
    pendingFocusIndex.current = null
    const rows = listRef.current?.querySelectorAll<HTMLElement>(
      '[data-media-row]',
    )
    if (!rows || rows.length === 0) {
      const addControl =
        listRef.current
          ?.closest('[data-media-assignments]')
          ?.querySelector<HTMLElement>('[data-add-control]') ?? null
      ;(addControl ?? listRef.current)?.focus()
      return
    }
    const row = rows[Math.min(targetIndex, rows.length - 1)]
    const target =
      row?.querySelector<HTMLButtonElement>('button:not([disabled])') ??
      row?.querySelector<HTMLButtonElement>('button')
    ;(target ?? listRef.current)?.focus()
  }, [value])

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
    <div className="space-y-4" data-media-assignments>
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
          data-add-control
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

      <div ref={listRef} tabIndex={-1}>
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
              const slotId = `campaign-media-${uid}-slot-${index}`
              const slotErrorId = `${slotId}-error`
              const focalXId = `campaign-media-${uid}-focal-x-${index}`
              const focalXErrorId = `${focalXId}-error`
              const focalYId = `campaign-media-${uid}-focal-y-${index}`
              const focalYErrorId = `${focalYId}-error`
              const altId = `campaign-media-${uid}-alt-${index}`
              const altDescriptionId = `${altId}-description`
              const altErrorId = `${altId}-error`
              const slotInvalid = Boolean(itemErrors?.slot || duplicate)
              return (
                <li
                  key={`${item.mediaId}:${item.slot}:${index}`}
                  data-media-row={index}
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
                          <Label htmlFor={slotId}>جایگاه</Label>
                          <Select
                            id={slotId}
                            value={item.slot}
                            disabled={disabled}
                            invalid={slotInvalid}
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
                          <FieldErrorMessage
                            id={slotErrorId}
                            message={
                              itemErrors?.slot ??
                              (duplicate
                                ? 'این رسانه در این جایگاه قبلاً انتخاب شده است.'
                                : null)
                            }
                          />
                        </Field>
                        <Field>
                          <Label htmlFor={focalXId}>نقطه کانونی افقی</Label>
                          <Input
                            id={focalXId}
                            type="number"
                            min={0}
                            max={100}
                            value={item.focalX}
                            disabled={disabled}
                            invalid={Boolean(itemErrors?.focalX)}
                            onChange={(event) =>
                              updateAt(index, { focalX: event.target.value })
                            }
                          />
                          <FieldErrorMessage
                            id={focalXErrorId}
                            message={itemErrors?.focalX}
                          />
                        </Field>
                        <Field>
                          <Label htmlFor={focalYId}>نقطه کانونی عمودی</Label>
                          <Input
                            id={focalYId}
                            type="number"
                            min={0}
                            max={100}
                            value={item.focalY}
                            disabled={disabled}
                            invalid={Boolean(itemErrors?.focalY)}
                            onChange={(event) =>
                              updateAt(index, { focalY: event.target.value })
                            }
                          />
                          <FieldErrorMessage
                            id={focalYErrorId}
                            message={itemErrors?.focalY}
                          />
                        </Field>
                      </div>

                      <Field>
                        <Label htmlFor={altId}>
                          متن جایگزین تخصیص (اختیاری)
                        </Label>
                        <Input
                          id={altId}
                          value={item.altFa}
                          maxLength={CAMPAIGN_MEDIA_ALT_MAX}
                          disabled={disabled}
                          invalid={Boolean(itemErrors?.altFa)}
                          onChange={(event) =>
                            updateAt(index, { altFa: event.target.value })
                          }
                        />
                        <Description className="text-xs text-muted" id={altDescriptionId}>
                          {item.altFa.length.toLocaleString('fa-IR')} از{' '}
                          {CAMPAIGN_MEDIA_ALT_MAX.toLocaleString('fa-IR')} کاراکتر
                        </Description>
                        <FieldErrorMessage
                          id={altErrorId}
                          message={itemErrors?.altFa}
                        />
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
                          onClick={() => {
                            pendingFocusIndex.current = index
                            onChange(
                              value.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }}
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
      </div>

      <CampaignMediaPickerDialog
        open={pickerOpen}
        maxReached={maxReached}
        onPick={addMedia}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
