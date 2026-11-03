import { Alert } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { Text } from '../catalyst/text'
import { gridOutcomeMessage } from '../../lib/grid-messages'
import type { CatalogGridRowResult } from '@sabz/types'

/**
 * Conflict resolution for a stale-version row (per-row CONFLICT_CHANGED,
 * SS-257). The operator's draft is never silently lost: they choose between
 * adopting the server version (drops the draft) or keeping their draft to
 * re-edit against the refreshed row. Server values are already visible in
 * the grid — the refetch happens before this dialog opens.
 */
export interface RowConflictDialogProps {
  result: CatalogGridRowResult | null
  serverPrice: string | null
  serverCompareAt: string | null
  serverStock: number | null
  onKeepDraft: () => void
  onDropDraft: () => void
  onClose: () => void
}

export function RowConflictDialog({
  result,
  serverPrice,
  serverCompareAt,
  serverStock,
  onKeepDraft,
  onDropDraft,
  onClose,
}: RowConflictDialogProps) {
  if (!result) {
    return null
  }

  return (
    <Alert open onClose={onClose} size="md">
      <Text className="font-semibold text-foreground">این ردیف تغییر کرده است</Text>
      <Text className="mt-2 text-sm text-muted">{gridOutcomeMessage(result)}</Text>
      <dl className="mt-4 space-y-2 rounded-lg border border-border bg-background px-4 py-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">قیمت فروش فعلی سرور</dt>
          <dd dir="ltr" className="font-medium">{serverPrice ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">فروش ویژه فعلی سرور</dt>
          <dd dir="ltr" className="font-medium">{serverCompareAt ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">موجودی فعلی سرور</dt>
          <dd dir="ltr" className="font-medium">{serverStock ?? '—'}</dd>
        </div>
      </dl>
      <Text className="mt-3 text-sm text-muted">
        تغییرات ذخیرهنشده شما از بین نمیرود؛ انتخاب کنید کدام نسخه باقی بماند.
      </Text>
      <div className="mt-5 flex items-center justify-start gap-3">
        <Button color="primary" onClick={onDropDraft}>
          نسخه سرور را بپذیرم (لغو تغییر من)
        </Button>
        <Button outline onClick={onKeepDraft}>
          تغییرات من را نگه دار
        </Button>
      </div>
    </Alert>
  )
}
