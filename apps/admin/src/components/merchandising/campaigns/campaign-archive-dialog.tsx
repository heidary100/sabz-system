import { useEffect, useState } from 'react'
import type { MerchCampaignDto } from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../catalyst/alert'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import { formatTehranDateTime } from '../../../lib/tehran-time'
import {
  merchandisingErrorMessage,
  parseMerchandisingError,
} from '../../../lib/merchandising-errors'
import { archiveMerchCampaign } from '../../../services/merchandising'

export function CampaignArchiveDialog({
  open,
  campaign,
  onClose,
  onArchived,
  onConflict,
}: {
  open: boolean
  campaign: MerchCampaignDto | null
  onClose: () => void
  onArchived: (campaign: MerchCampaignDto) => void
  onConflict: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSubmitting(false)
      setError(null)
    }
  }, [open])

  const current = campaign?.usage.currentPublications ?? []
  const scheduled = campaign?.usage.scheduledPublications ?? []
  const inUse = current.length > 0 || scheduled.length > 0

  const handleConfirm = async (): Promise<void> => {
    if (!campaign || inUse || submitting) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const updated = await archiveMerchCampaign(campaign.id)
      onArchived(updated)
      onClose()
    } catch (error) {
      const parsed = parseMerchandisingError(error)
      setError(merchandisingErrorMessage(error))
      if (parsed?.status === 409) {
        onConflict()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={submitting ? () => undefined : onClose} size="lg">
      <AlertTitle>بایگانی کمپین</AlertTitle>
      <AlertDescription>
        {campaign
          ? `کمپین «${campaign.internalName}» بایگانی می‌شود و دیگر قابل ویرایش یا فعال‌سازی نیست. نسخه‌های منتشرشده قبلی تغییر نمی‌کنند.`
          : ''}
      </AlertDescription>
      <AlertBody>
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-semibold text-foreground">
              استفاده در صفحه اصلی
            </p>
            {current.length === 0 && scheduled.length === 0 ? (
              <Text className="mt-1 text-sm text-muted">
                این کمپین در نسخه منتشرشده یا زمان‌بندی‌شده‌ای استفاده نمی‌شود.
              </Text>
            ) : (
              <div className="mt-2 space-y-2">
                {current.map((publication) => (
                  <p key={publication.id} className="text-sm text-foreground">
                    نسخه منتشرشده {publication.version.toLocaleString('fa-IR')}
                    {publication.publishedAt
                      ? ` · ${formatTehranDateTime(publication.publishedAt)}`
                      : ''}
                  </p>
                ))}
                {scheduled.map((publication) => (
                  <p key={publication.id} className="text-sm text-foreground">
                    نسخه زمان‌بندی‌شده{' '}
                    {publication.version.toLocaleString('fa-IR')}
                    {publication.publishAt
                      ? ` · ${formatTehranDateTime(publication.publishAt)}`
                      : ''}
                  </p>
                ))}
              </div>
            )}
          </div>

          {inUse && (
            <p
              role="status"
              className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning"
            >
              این کمپین در صفحه اصلی استفاده می‌شود؛ ابتدا آن را از صفحه اصلی
              حذف و تغییرات را منتشر کنید.
            </p>
          )}
          {error && <InlineError message={error} />}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button
          color="danger"
          onClick={() => void handleConfirm()}
          disabled={inUse || submitting}
        >
          {submitting ? 'در حال بایگانی…' : 'بایگانی'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
