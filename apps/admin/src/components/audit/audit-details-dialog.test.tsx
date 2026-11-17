// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuditEntry } from '@sabz/types'
import { AuditDetailsDialog } from './audit-details-dialog'
import { formatDateTime } from '../../lib/format'
import { formatTehranDateTime } from '../../lib/tehran-time'

const entry: AuditEntry = {
  id: 'audit-1',
  userId: 'user-1',
  actor: {
    id: 'user-1',
    firstName: 'سارا',
    lastName: 'احمدی',
    mobile: '09120000000',
  },
  action: 'HOMEPAGE_SCHEDULED_ACTIVATION_FAILED',
  entity: 'HomepagePublication',
  entityId: 'publication-1',
  before: null,
  after: { errorCode: 'P1001' },
  ipAddress: null,
  createdAt: '2026-11-10T08:30:00.000Z',
}

describe('AuditDetailsDialog timestamp formatter', () => {
  afterEach(cleanup)

  it('preserves the default local formatter for existing consumers', () => {
    render(
      <AuditDetailsDialog
        entry={entry}
        open
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(formatDateTime(entry.createdAt))).toBeTruthy()
  })

  it('accepts an explicit Tehran formatter for publication diagnostics', () => {
    render(
      <AuditDetailsDialog
        entry={entry}
        open
        onClose={vi.fn()}
        timestampFormatter={formatTehranDateTime}
      />,
    )
    expect(screen.getByText(formatTehranDateTime(entry.createdAt))).toBeTruthy()
    expect(screen.getByText(/به وقت تهران/)).toBeTruthy()
  })
})
