import { useEffect, useState } from 'react'
import type { AdminPartnerDetail, PartnerTierSummary } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Select } from '../catalyst/select'
import { Text } from '../catalyst/text'
import { translateApiError } from '../../lib/error-messages'
import { changePartnerTier } from '../../services/partners'

export function TierChangeDialog({
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTierId('')
      setError(null)
    }
  }, [open])

  const currentTierId = partner.tier?.id ?? ''
  const canSubmit = Boolean(tierId) && tierId !== currentTierId && !submitting && !tiersLoading

  const handleSubmit = async (): Promise<void> => {
    if (!tierId) {
      setError('انتخاب تایر جدید الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const updated = await changePartnerTier(partner.id, { tierId })
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
      <AlertTitle>تغییر تایر همکار</AlertTitle>
      <AlertDescription>
        تایر فعلی: {partner.tier ? `${partner.tier.name} — ${partner.tier.discountPercent}٪ تخفیف` : 'تعیین نشده'}
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
          <Field>
            <Label>تایر جدید</Label>
            {tiersError ? (
              <div className="space-y-2">
                <Text className="text-sm text-red-700 dark:text-red-400">{translateApiError(tiersError)}</Text>
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

          <Text className="text-sm text-muted">
            تغییر تایر فقط برای همکاران تأییدشده ممکن است و در سامانه ثبت می‌شود.
          </Text>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {submitting ? 'در حال تغییر…' : 'ثبت تغییر'}
        </Button>
      </AlertActions>
    </Alert>
  )
}