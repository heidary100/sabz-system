import { describe, expect, it } from 'vitest'
import type { HomepageDraftValidationResult } from '@sabz/types'
import {
  deriveHomepageReadiness,
  parseHomepageValidationIssues,
  publicationRevisionComparison,
} from './merchandising-publication'

function validation(
  overrides: Partial<HomepageDraftValidationResult> = {},
): HomepageDraftValidationResult {
  return {
    revision: 4,
    schemaVersion: 1,
    valid: true,
    errors: [],
    warnings: [],
    ...overrides,
  }
}

const base = {
  hasDraft: true,
  loading: false,
  revision: 4,
  schemaVersion: 1,
  dirty: false,
  saving: false,
  conflict: false,
  validating: false,
  validation: validation(),
  validationTarget: 'server' as const,
  validationOutdated: false,
  publishing: false,
}

describe('homepage publication readiness (SS-279)', () => {
  it('blocks a dirty draft even when the last saved validation passed', () => {
    const readiness = deriveHomepageReadiness({ ...base, dirty: true })
    expect(readiness.step).toBe('DIRTY')
    expect(readiness.publishable).toBe(false)
    expect(readiness.blockingReason).toContain('ذخیره')
  })

  it('does not treat local validation as saved-revision validation', () => {
    const readiness = deriveHomepageReadiness({
      ...base,
      validationTarget: 'local',
    })
    expect(readiness.step).toBe('LOCAL_VALIDATION')
    expect(readiness.publishable).toBe(false)
  })

  it('requires validation before enabling publication', () => {
    expect(
      deriveHomepageReadiness({ ...base, validation: null }).publishable,
    ).toBe(false)
  })

  it('enables publication only for a current server validation', () => {
    const readiness = deriveHomepageReadiness(base)
    expect(readiness.step).toBe('READY')
    expect(readiness.publishable).toBe(true)
    expect(readiness.requiresWarningAcknowledgement).toBe(false)
  })

  it('blocks publication when validation has errors', () => {
    const readiness = deriveHomepageReadiness({
      ...base,
      validation: validation({
        valid: false,
        errors: [
          {
            path: 'sections[0].settings.limit',
            code: 'INVALID_LIMIT',
            message: 'محدودیت نامعتبر است.',
            severity: 'ERROR',
            category: 'STRUCTURAL',
          },
        ],
      }),
    })
    expect(readiness.step).toBe('ERRORS')
    expect(readiness.errorCount).toBe(1)
    expect(readiness.publishable).toBe(false)
  })

  it('keeps warnings non-blocking but requires acknowledgement', () => {
    const readiness = deriveHomepageReadiness({
      ...base,
      validation: validation({
        warnings: [
          {
            path: 'sections[0].settings.title',
            code: 'SHORT_TITLE',
            message: 'عنوان کوتاه است.',
            severity: 'WARNING',
            category: 'WARNING',
          },
        ],
      }),
    })
    expect(readiness.step).toBe('READY_WITH_WARNINGS')
    expect(readiness.publishable).toBe(true)
    expect(readiness.requiresWarningAcknowledgement).toBe(true)
    expect(readiness.warningCount).toBe(1)
  })

  it('invalidates readiness when the result is outdated or revision-bound', () => {
    expect(
      deriveHomepageReadiness({ ...base, validationOutdated: true }).step,
    ).toBe('OUTDATED')
    expect(
      deriveHomepageReadiness({
        ...base,
        validation: validation({ revision: 3 }),
      }).step,
    ).toBe('OUTDATED')
    expect(
      deriveHomepageReadiness({
        ...base,
        validation: validation({ schemaVersion: 2 }),
      }).step,
    ).toBe('OUTDATED')
  })

  it('blocks while validating, saving, publishing, conflicting, or loading', () => {
    expect(deriveHomepageReadiness({ ...base, validating: true }).step).toBe(
      'VALIDATING',
    )
    expect(deriveHomepageReadiness({ ...base, saving: true }).step).toBe(
      'SAVING',
    )
    expect(deriveHomepageReadiness({ ...base, publishing: true }).step).toBe(
      'PUBLISHING',
    )
    expect(deriveHomepageReadiness({ ...base, conflict: true }).step).toBe(
      'CONFLICT',
    )
    expect(
      deriveHomepageReadiness({ ...base, hasDraft: false }).step,
    ).toBe('NO_DRAFT')
    expect(deriveHomepageReadiness({ ...base, loading: true }).step).toBe(
      'LOADING',
    )
  })
})

describe('publication validation issue parsing', () => {
  it('preserves unknown paths, codes, and messages', () => {
    const parsed = parseHomepageValidationIssues([
      {
        path: 'sections[12].settings.unknown',
        code: 'UNKNOWN_CODE',
        message: 'پیام ناشناخته',
        severity: 'WARNING',
        category: 'NOT_A_CATEGORY',
      },
      { path: 3, message: 'نامعتبر' },
      null,
    ])
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({
      path: 'sections[12].settings.unknown',
      code: 'UNKNOWN_CODE',
      message: 'پیام ناشناخته',
      severity: 'WARNING',
      category: 'STRUCTURAL',
    })
  })

  it('labels revision comparison as indicative', () => {
    expect(publicationRevisionComparison(7, 6)).toContain('۷')
    expect(publicationRevisionComparison(7, 6)).toContain('۶')
    expect(publicationRevisionComparison(null, 6)).toContain('—')
  })
})
