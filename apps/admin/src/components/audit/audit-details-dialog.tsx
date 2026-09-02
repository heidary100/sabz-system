import type { AuditEntry } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { Text } from '../catalyst/text'
import { formatDateTime } from '../../lib/format'
import {
  auditActionLabel,
  auditEntityLabel,
} from '../../lib/audit-labels'
import { sanitizeAuditPayload } from '../../lib/audit-sanitize'

function PayloadSection({
  title,
  payload,
}: {
  title: string
  payload: Record<string, string | number | boolean> | null
}) {
  if (!payload) {
    return null
  }
  return (
    <div>
      <p className="text-sm/6 font-semibold text-foreground">{title}</p>
      <dl className="mt-2 space-y-1.5 rounded-lg border border-border bg-background p-3">
        {Object.entries(payload).map(([key, value]) => (
          <div key={key} className="grid grid-cols-[9rem_1fr] gap-3 text-sm/6">
            <dt className="text-muted">{key}</dt>
            <dd dir="auto" className="break-words text-foreground">
              {String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function AuditDetailsDialog({
  entry,
  open,
  onClose,
}: {
  entry: AuditEntry | null
  open: boolean
  onClose: () => void
}) {
  if (!entry) {
    return null
  }

  const before = sanitizeAuditPayload(entry.before)
  const after = sanitizeAuditPayload(entry.after)

  return (
    <Alert open={open} onClose={onClose} size="3xl">
      <AlertTitle>
        {auditActionLabel(entry.action)}{' '}
        <span className="font-normal text-muted">{auditEntityLabel(entry.entity)}</span>
      </AlertTitle>
      <AlertBody>
        <div className="space-y-4">
          <dl className="grid gap-2 text-sm/6 sm:grid-cols-2">
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <dt className="text-muted">زمان</dt>
              <dd className="text-foreground">{formatDateTime(entry.createdAt)}</dd>
            </div>
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <dt className="text-muted">عامل</dt>
              <dd className="text-foreground">
                {entry.actor
                  ? [entry.actor.firstName, entry.actor.lastName]
                      .filter(Boolean)
                      .join(' ') || entry.actor.mobile
                  : 'سیستم/ناشناس'}
              </dd>
            </div>
            {entry.entityId ? (
              <div className="grid grid-cols-[6rem_1fr] gap-3">
                <dt className="text-muted">شناسه موجودیت</dt>
                <dd dir="ltr" className="break-all text-foreground">
                  {entry.entityId}
                </dd>
              </div>
            ) : null}
            {entry.ipAddress ? (
              <div className="grid grid-cols-[6rem_1fr] gap-3">
                <dt className="text-muted">آی‌پی</dt>
                <dd dir="ltr" className="text-foreground">
                  {entry.ipAddress}
                </dd>
              </div>
            ) : null}
          </dl>

          {before === null && after === null ? (
            <Text>جزئیات اضافه‌ای برای این رویداد ثبت نشده است.</Text>
          ) : (
            <div className="space-y-4">
              <PayloadSection title="قبل" payload={before} />
              <PayloadSection title="بعد" payload={after} />
            </div>
          )}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose}>
          بستن
        </Button>
      </AlertActions>
    </Alert>
  )
}
