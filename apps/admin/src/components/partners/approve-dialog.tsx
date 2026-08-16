import { useEffect, useState } from 'react'
import type { AdminPartnerDetail, PartnerTierSummary } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Select } from '../catalyst/select'
import { Textarea } from '../catalyst/textarea'
import { Text } from '../catalyst/text'
import { translateApiError } from '../../lib/error-messages'
import { approvePartner } from '../../services/partners'

const REVIEW_NOTES_MAX = 1000

export function ApproveDialog({
  open,
  partner,
  tiers,
  tiersLoading,
  tiersError,
  onRetryTiers,
  onClose,
  onSuccess,
}: {
  open: boolean
  partner: AdminPartnerDetail
  tiers: PartnerTierSummary[]
  tiersLoading: boolean
  tiersError: unknown
  onRetryTiers: () => void
  onClose: () => void
  onSuccess: (updated: AdminPartnerDetail) => void
}) {
  const [tierId, setTierId] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTierId('')
      setReviewNotes('')
      setError(null)
    }
  }, [open])

  const canSubmit = Boolean(tierId) && !submitting && !tiersLoading

  const handleSubmit = async (): Promise<void> => {
    if (!tierId) {
      setError('انتخاب تایر الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const updated = await approvePartner(partner.id, {
        tierId,
        ...(reviewNotes.trim() ? { reviewNotes: reviewNotes.trim() } : {}),
      })
      onSuccess(updated)
      onClose()
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="md">
      <AlertTitle>تأیید درخواست همکاری</AlertTitle>
      <AlertDescription>
        با تأیید این درخواست، دسترسی همکاری برای {partner.businessName} فعال می‌شود و
        قیمت‌های عمده‌فروشی بر اساس تایر انتخابی اعمال خواهد شد.
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
          <Field>
            <Label>تایر قیمت‌گذاری</Label>
            {tiersError ? (
              <div className="space-y-2">
                <Text className="text-sm text-red-700">{translateApiError(tiersError)}</Text>
                <Button outline onClick={onRetryTiers} disabled={submitting}>
                  تلاش مجدد
                </Button>
              </div>
            ) : (
              <Select
                name="tierId"
                value={tierId}
                onChange={(event) => setTierId(event.target.value)}
                disabled={submitting || tiersLoading}
              >
                <option value="">{tiersLoading ? 'در حال بارگذاری تایرها…' : 'انتخاب کنید'}</option>
                {tiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.name} — {tier.discountPercent}٪ تخفیف
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field>
            <Label>یادداشت بررسی (داخلی)</Label>
            <Textarea
              name="reviewNotes"
              value={reviewNotes}
              maxLength={REVIEW_NOTES_MAX}
              rows={3}
              onChange={(event) => setReviewNotes(event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-zinc-500">
              {reviewNotes.length}/{REVIEW_NOTES_MAX} — این یادداشت فقط برای بررسی‌کنندگان نمایش
              داده می‌شود.
            </Text>
          </Field>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {submitting ? 'در حال تأیید…' : 'تأیید درخواست'}
        </Button>
      </AlertActions>
    </Alert>
  )
}