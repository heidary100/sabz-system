import { describe, expect, it } from 'vitest'
import { sanitizeAuditPayload } from './audit-sanitize'

describe('sanitizeAuditPayload national ID policy (SS-260)', () => {
  it('drops raw personal National ID keys', () => {
    const result = sanitizeAuditPayload({
      firstName: 'علی',
      nationalId: '6059926746',
      national_id: '6059926746',
      codeMelli: '6059926746',
      code_melli: '6059926746',
    })

    expect(result).toEqual({ firstName: 'علی' })
  })

  it('keeps the safe nationalIdChanged boolean', () => {
    const result = sanitizeAuditPayload({
      nationalIdChanged: true,
      firstName: 'علی',
    })

    expect(result).toEqual({ nationalIdChanged: true, firstName: 'علی' })
  })

  it('continues to drop secret-like keys', () => {
    const result = sanitizeAuditPayload({
      passwordHash: 'x',
      refreshToken: 'x',
      storageKey: 'x',
      nationalId: '6059926746',
    })

    expect(result).toBeNull()
  })
})
