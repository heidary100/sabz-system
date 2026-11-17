import { describe, expect, it } from 'vitest'
import type { AuditEntry } from '@sabz/types'
import {
  auditActorLabel,
  auditEventDisposition,
  classifyPublicationDiagnostic,
  diagnosticCodeLabel,
  isRollbackEligible,
} from './merchandising-publication-diagnostics'

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'audit-1',
    userId: 'user-1',
    actor: {
      id: 'user-1',
      firstName: 'سارا',
      lastName: 'احمدی',
      mobile: '09120000000',
    },
    action: 'HOMEPAGE_PUBLICATION_CANCELLED',
    entity: 'HomepagePublication',
    entityId: 'publication-1',
    before: null,
    after: null,
    ipAddress: null,
    createdAt: '2026-11-10T10:00:00.000Z',
    ...overrides,
  }
}

const base = {
  status: 'SCHEDULED' as const,
  rollbackFromPublicationId: null,
}

describe('publication activation diagnostics (SS-281)', () => {
  it('describes a scheduled publication without failure evidence as waiting', () => {
    const diagnostic = classifyPublicationDiagnostic(base, [])
    expect(diagnostic.kind).toBe('SCHEDULED_WAITING')
    expect(diagnostic.retryable).toBe(false)
    expect(diagnostic.origin).toBeNull()
  })

  it('treats a transient activation failure as retryable while status remains SCHEDULED', () => {
    const diagnostic = classifyPublicationDiagnostic(base, [
      entry({
        id: 'failed',
        action: 'HOMEPAGE_SCHEDULED_ACTIVATION_FAILED',
        after: {
          status: 'SCHEDULED',
          errorCode: 'P1001',
          message: 'internal connection detail that must not be shown',
        },
      }),
    ])
    expect(diagnostic.kind).toBe('SCHEDULED_RETRYING')
    expect(diagnostic.retryable).toBe(true)
    expect(diagnostic.tone).toBe('warning')
    expect(diagnostic.failureCodes).toEqual(['P1001'])
    expect(diagnostic.summary).not.toContain('internal connection detail')
  })

  it('distinguishes successful activation from plain publication', () => {
    expect(
      classifyPublicationDiagnostic(
        { ...base, status: 'PUBLISHED' },
        [
          entry({
            action: 'HOMEPAGE_SCHEDULED_ACTIVATED',
          }),
        ],
      ).kind,
    ).toBe('ACTIVATED')

    expect(
      classifyPublicationDiagnostic({ ...base, status: 'PUBLISHED' }, []).kind,
    ).toBe('PUBLISHED')
  })

  it('labels rollback-created publications with their rollback source', () => {
    const diagnostic = classifyPublicationDiagnostic(
      {
        ...base,
        status: 'PUBLISHED',
        rollbackFromPublicationId: 'publication-old',
      },
      [entry({ action: 'HOMEPAGE_ROLLBACK_CREATED' })],
    )
    expect(diagnostic.kind).toBe('ROLLED_BACK')
    expect(diagnostic.summary).toContain('بازگردانی')
  })

  it('labels operator cancellation only from operator cancellation evidence', () => {
    const diagnostic = classifyPublicationDiagnostic(
      { ...base, status: 'CANCELLED' },
      [entry({ action: 'HOMEPAGE_PUBLICATION_CANCELLED' })],
    )
    expect(diagnostic.kind).toBe('OPERATOR_CANCELLED')
    expect(diagnostic.origin).toBe('operator')
  })

  it('labels system-blocked termination only from blocked evidence and keeps safe codes', () => {
    const diagnostic = classifyPublicationDiagnostic(
      { ...base, status: 'CANCELLED' },
      [
        entry({
          action: 'HOMEPAGE_SCHEDULED_ACTIVATION_BLOCKED',
          actor: null,
          userId: 'system:homepage-activation',
          after: {
            status: 'CANCELLED',
            code: 'DEPENDENCIES_INVALID',
            dependencyCodes: ['MEDIA_MISSING', 'HERO_DESKTOP_MEDIA_REQUIRED'],
          },
        }),
      ],
    )
    expect(diagnostic.kind).toBe('SYSTEM_BLOCKED')
    expect(diagnostic.origin).toBe('system')
    expect(diagnostic.failureCodes).toEqual([
      'DEPENDENCIES_INVALID',
      'MEDIA_MISSING',
      'HERO_DESKTOP_MEDIA_REQUIRED',
    ])
    expect(diagnosticCodeLabel('MEDIA_MISSING')).toContain('رسانه')
  })

  it('does not infer a cancellation reason from CANCELLED alone', () => {
    const diagnostic = classifyPublicationDiagnostic(
      { ...base, status: 'CANCELLED' },
      [],
    )
    expect(diagnostic.kind).toBe('CANCELLED_UNKNOWN')
    expect(diagnostic.label).toContain('دلیل نامشخص')
    expect(diagnostic.origin).toBeNull()
  })

  it('uses the newest terminal evidence when both cancellation events exist', () => {
    const diagnostic = classifyPublicationDiagnostic(
      { ...base, status: 'CANCELLED' },
      [
        entry({
          id: 'blocked',
          action: 'HOMEPAGE_SCHEDULED_ACTIVATION_BLOCKED',
          createdAt: '2026-11-10T09:00:00.000Z',
        }),
        entry({
          id: 'operator',
          action: 'HOMEPAGE_PUBLICATION_CANCELLED',
          createdAt: '2026-11-10T10:00:00.000Z',
        }),
      ],
    )
    expect(diagnostic.kind).toBe('OPERATOR_CANCELLED')
  })

  it('treats superseded as historical and only that status as rollback-eligible', () => {
    expect(
      classifyPublicationDiagnostic({ ...base, status: 'SUPERSEDED' }, []).kind,
    ).toBe('SUPERSEDED')
    expect(isRollbackEligible('SUPERSEDED')).toBe(true)
    expect(isRollbackEligible('PUBLISHED')).toBe(false)
    expect(isRollbackEligible('SCHEDULED')).toBe(false)
    expect(isRollbackEligible('CANCELLED')).toBe(false)
  })
})

describe('publication audit attribution and event mapping', () => {
  it('keeps opaque system actor identifiers', () => {
    expect(
      auditActorLabel(
        entry({ actor: null, userId: 'system:homepage-activation' }),
      ),
    ).toContain('system:homepage-activation')
  })

  it('falls back neutrally when actor metadata is absent', () => {
    expect(auditActorLabel(entry({ actor: null, userId: null }))).toBe(
      'سیستم/ناشناس',
    )
  })

  it('maps known actions and preserves unknown actions as other events', () => {
    expect(
      auditEventDisposition('HOMEPAGE_SCHEDULED_ACTIVATION_BLOCKED'),
    ).toMatchObject({ label: 'مسدودسازی سیستم', tone: 'danger' })
    expect(auditEventDisposition('UNKNOWN_FUTURE_ACTION')).toMatchObject({
      label: 'سایر',
      tone: 'neutral',
    })
  })
})
