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
import { Textarea } from '../../catalyst/textarea'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import { formatTehranDateTime } from '../../../lib/tehran-time'

export function HomepagePublishDialog({
  open,
  revision,
  sectionCount,
  currentPublishedAt,
  warnings,
  submitting,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean
  revision: number
  sectionCount: number
  currentPublishedAt: string | null
  warnings: HomepageValidationIssue[]
  submitting: boolean
  error: string | null
  onClose: () => void
  onConfirm: (note: string | null) => void
}) {
  const [note, setNote] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => {
    if (open) {
      setNote('')
      setAcknowledged(false)
    }
  }, [open])

  const requiresAcknowledgement = warnings.length > 0
  const canConfirm =
    !submitting && (!requiresAcknowledgement || acknowledged)

  return (
    <Alert
      open={open}
      onClose={submitting ? () => undefined : onClose}
      size="lg"
    >
      <AlertTitle>انتشار فوری صفحه اصلی</AlertTitle>
      <AlertDescription>
        این عملیات نسخه ذخیره‌شده پیش‌نویس را همین حالا منتشر می‌کند. تا تأیید
        سرور، انتشار را موفق در نظر نگیرید.
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
              <p className="text-xs text-muted">نسخه منتشرشده فعلی</p>
              <p className="text-sm text-foreground">
                {currentPublishedAt
                  ? `آخرین انتشار: ${formatTehranDateTime(currentPublishedAt)}`
                  : 'هنوز نسخه‌ای منتشر نشده است.'}
              </p>
            </div>
          </div>

          <div className="space-y-1 text-sm text-foreground">
            <p>
              پس از انتشار، فروشگاه عمومی از این نسخه استفاده می‌کند و نسخه
              منتشرشده قبلی «جایگزین‌شده» می‌شود.
            </p>
            <p className="text-muted">
              این انتشار فوری است؛ زمان‌بندی، منطقه زمانی یا انتشار در آینده در
              این جریان پشتیبانی نمی‌شود. نسخه‌های منتشرشده قبلی تغییر نمی‌کنند.
            </p>
            <p className="text-muted">
              این جریان هیچ پیش‌نمایش عمومی از پیش‌نویس منتشرنشده نمی‌سازد و
              انتشار فوری به‌تنهایی تضمینی برای پاک‌سازی فوری cache یا CDN نیست.
            </p>
          </div>

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
                هشدارهای بالا را بررسی کردم و با انتشار ادامه می‌دهم.
              </label>
            </div>
          )}

          <Field>
            <Label htmlFor="homepage-publish-note">یادداشت (اختیاری)</Label>
            <Textarea
              id="homepage-publish-note"
              rows={2}
              maxLength={500}
              value={note}
              disabled={submitting}
              onChange={(event) => setNote(event.target.value)}
            />
            <Text className="text-xs text-muted">حداکثر ۵۰۰ کاراکتر.</Text>
          </Field>

          {error && <InlineError message={error} />}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button
          color="primary"
          disabled={!canConfirm}
          onClick={() => onConfirm(note.trim() ? note.trim() : null)}
        >
          {submitting ? 'در حال انتشار…' : 'انتشار فوری'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
