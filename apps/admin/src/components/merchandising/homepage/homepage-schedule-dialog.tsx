import { useEffect, useState } from 'react'
import type { HomepageValidationIssue } from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../catalyst/alert'
import { Button } from '../../catalyst/button'
import { Field, Label } from '../../catalyst/fieldset'
import { Input } from '../../catalyst/input'
import { Textarea } from '../../catalyst/textarea'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import {
  BUSINESS_TIME_ZONE_LABEL,
  TEHRAN_TIME_NOTE,
  currentTehranDateTimeInput,
  formatTehranDateTime,
  tehranDateTimeInputToUtcIso,
} from '../../../lib/tehran-time'

export function HomepageScheduleDialog({
  open,
  revision,
  sectionCount,
  warnings,
  submitting,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean
  revision: number
  sectionCount: number
  warnings: HomepageValidationIssue[]
  submitting: boolean
  error: string | null
  onClose: () => void
  onConfirm: (input: { publishAt: string; note: string | null }) => void
}) {
  const [publishAt, setPublishAt] = useState('')
  const [note, setNote] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPublishAt('')
      setNote('')
      setAcknowledged(false)
      setLocalError(null)
    }
  }, [open])

  const requiresAcknowledgement = warnings.length > 0
  const canConfirm =
    !submitting &&
    publishAt !== '' &&
    (!requiresAcknowledgement || acknowledged)

  const handleConfirm = (): void => {
    setLocalError(null)
    const utcIso = tehranDateTimeInputToUtcIso(publishAt)
    if (!utcIso) {
      setLocalError('زمان انتشار را به‌صورت معتبر و به وقت تهران وارد کنید.')
      return
    }
    if (Date.parse(utcIso) <= Date.now()) {
      setLocalError('زمان انتشار باید در آینده باشد.')
      return
    }
    onConfirm({
      publishAt: utcIso,
      note: note.trim() ? note.trim() : null,
    })
  }

  const tehranPreview = (() => {
    const utcIso = tehranDateTimeInputToUtcIso(publishAt)
    return utcIso ? formatTehranDateTime(utcIso) : null
  })()

  return (
    <Alert
      open={open}
      onClose={submitting ? () => undefined : onClose}
      size="lg"
    >
      <AlertTitle>زمان‌بندی انتشار صفحه اصلی</AlertTitle>
      <AlertDescription>
        این عملیات نسخه ذخیره‌شده پیش‌نویس را برای انتشار در زمان انتخاب‌شده
        ثبت می‌کند. محتوای عمومی فروشگاه تا زمان فعال‌سازی تغییر نمی‌کند.
      </AlertDescription>
      <AlertBody>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted">نسخه ذخیره‌شده</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {revision.toLocaleString('fa-IR')}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">تعداد بخش‌ها</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {sectionCount.toLocaleString('fa-IR')}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted">
                زمان‌بندی به وقت {BUSINESS_TIME_ZONE_LABEL}
              </p>
              <p className="text-sm text-foreground">
                {tehranPreview ?? 'هنوز زمانی انتخاب نشده است.'}
              </p>
            </div>
          </div>

          <Field>
            <Label htmlFor="homepage-schedule-at">
              زمان انتشار ({TEHRAN_TIME_NOTE})
            </Label>
            <Input
              id="homepage-schedule-at"
              type="datetime-local"
              dir="ltr"
              min={currentTehranDateTimeInput()}
              value={publishAt}
              disabled={submitting}
              onChange={(event) => {
                setPublishAt(event.target.value)
                setLocalError(null)
              }}
            />
            <Text className="text-xs text-muted">
              زمان وارد‌شده به وقت تهران ({BUSINESS_TIME_ZONE_LABEL}) است و پیش
              از ارسال به UTC تبدیل می‌شود. منطقه زمانی مرورگر استفاده نمی‌شود.
            </Text>
          </Field>

          <Field>
            <Label htmlFor="homepage-schedule-note">یادداشت (اختیاری)</Label>
            <Textarea
              id="homepage-schedule-note"
              rows={2}
              maxLength={500}
              value={note}
              disabled={submitting}
              onChange={(event) => setNote(event.target.value)}
            />
            <Text className="text-xs text-muted">حداکثر ۵۰۰ کاراکتر.</Text>
          </Field>

          {requiresAcknowledgement && (
            <div className="space-y-2 rounded-xl border border-warning-border bg-warning-subtle p-3">
              <p className="text-sm font-semibold text-warning">
                این نسخه {warnings.length.toLocaleString('fa-IR')} هشدار دارد
              </p>
              <ul className="space-y-2">
                {warnings.map((warning, index) => (
                  <li
                    key={`${warning.path}-${warning.code}-${index}`}
                    className="rounded-lg bg-background/60 px-3 py-2"
                  >
                    <p className="text-sm text-foreground">{warning.message}</p>
                    <p className="mt-1 text-xs text-muted">
                      <span dir="ltr">{warning.path}</span> ·{' '}
                      <span dir="ltr">{warning.code}</span>
                    </p>
                  </li>
                ))}
              </ul>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  disabled={submitting}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5 size-4 rounded border-border accent-primary"
                />
                هشدارهای بالا را بررسی کردم و با زمان‌بندی ادامه می‌دهم.
              </label>
            </div>
          )}

          <Text className="text-xs text-muted">
            فعال‌سازی در زمان مقرر توسط backend انجام می‌شود. اگر وابستگی‌های
            نسخه در آن زمان معتبر نباشند، backend ممکن است فعال‌سازی را مسدود
            کند؛ این رابط وضعیت نهایی سرور را نمایش می‌دهد. لغو فقط تا پیش از
            فعال‌سازی و برای نسخه زمان‌بندی‌شده ممکن است.
          </Text>

          {(localError || error) && (
            <InlineError message={localError ?? error ?? ''} />
          )}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button
          color="primary"
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          {submitting ? 'در حال زمان‌بندی…' : 'ثبت زمان‌بندی'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
