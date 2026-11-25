import { describe, expect, it } from 'vitest'
import { adminDisplayName, hasDisplayName } from './identity'

describe('admin header identity', () => {
  it('prefers the full name when both parts are usable', () => {
    const user = {
      mobile: '+989120000000',
      profile: { firstName: 'سارا', lastName: 'احمدی' },
    }
    expect(adminDisplayName(user)).toBe('سارا احمدی')
    expect(hasDisplayName(user)).toBe(true)
  })

  it('uses a single usable name part without stray spaces', () => {
    expect(
      adminDisplayName({ mobile: '0912', profile: { firstName: 'سارا', lastName: ' ' } }),
    ).toBe('سارا')
  })

  it('falls back to the phone when the name is absent or blank', () => {
    expect(adminDisplayName({ mobile: '09121234567' })).toBe('09121234567')
    expect(
      adminDisplayName({
        mobile: '09121234567',
        profile: { firstName: '  ', lastName: '' },
      }),
    ).toBe('09121234567')
    expect(hasDisplayName({ mobile: '0912' })).toBe(false)
  })

  it('returns an empty label for an absent user', () => {
    expect(adminDisplayName(null)).toBe('')
  })
})
