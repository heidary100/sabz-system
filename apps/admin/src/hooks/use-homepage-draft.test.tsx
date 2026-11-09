// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomepageDraftDto, HomepageDraftSection } from '@sabz/types'
import { useHomepageDraft } from './use-homepage-draft'
import {
  getHomepageDraft,
  replaceHomepageDraft,
  validateHomepageDraft,
} from '../services/merchandising'
import { ApiError } from '../services/api'

vi.mock('../services/merchandising', () => ({
  getHomepageDraft: vi.fn(),
  replaceHomepageDraft: vi.fn(),
  validateHomepageDraft: vi.fn(),
}))

const mockGet = vi.mocked(getHomepageDraft)
const mockReplace = vi.mocked(replaceHomepageDraft)
const mockValidate = vi.mocked(validateHomepageDraft)

const sections: HomepageDraftSection[] = [
  {
    key: 'trust-main',
    type: 'TRUST_STRIP',
    order: 0,
    isVisible: true,
    settings: {
      items: [{ icon: 'truck', title: 'ارسال سریع' }],
    },
  },
  {
    key: 'ready-main',
    type: 'READY_TO_SHIP',
    order: 1,
    isVisible: true,
    settings: { limit: 4 },
  },
]

const draft: HomepageDraftDto = {
  revision: 3,
  schemaVersion: 1,
  sections,
  updatedAt: '2026-11-09T10:00:00.000Z',
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StrictMode>{children}</StrictMode>
)

describe('useHomepageDraft (SS-276)', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockReplace.mockReset()
    mockValidate.mockReset()
    mockGet.mockResolvedValue(draft)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('loads the singleton draft once under StrictMode and preserves revision metadata', async () => {
    const { result } = renderHook(() => useHomepageDraft(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(result.current.revision).toBe(3)
    expect(result.current.schemaVersion).toBe(1)
    expect(result.current.sections).toHaveLength(2)
    expect(result.current.dirty).toBe(false)
  })

  it('saves the complete document with the current revision and updates local revision', async () => {
    const updated: HomepageDraftDto = {
      ...draft,
      revision: 4,
      sections: [{ ...draft.sections[0]!, isVisible: false }, draft.sections[1]!],
      updatedAt: '2026-11-09T10:05:00.000Z',
    }
    mockReplace.mockResolvedValue(updated)
    const { result } = renderHook(() => useHomepageDraft(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.updateSections(
        result.current.sections.map((section, index) =>
          index === 0 ? { ...section, isVisible: false } : section,
        ),
      )
    })
    expect(result.current.dirty).toBe(true)

    await act(async () => {
      await result.current.save()
    })

    expect(mockReplace).toHaveBeenCalledWith({
      revision: 3,
      sections: updated.sections,
    })
    expect(result.current.revision).toBe(4)
    expect(result.current.dirty).toBe(false)
    expect(result.current.saveMessage).toContain('ذخیره شد')
  })

  it('preserves local edits after a failed save', async () => {
    mockReplace.mockRejectedValue(
      new ApiError(400, {
        statusCode: 400,
        error: 'HOMEPAGE_DRAFT_INVALID',
        message: ['بخش اول نامعتبر است.'],
      } as never),
    )
    const { result } = renderHook(() => useHomepageDraft(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.updateSections([...result.current.sections, {
        key: 'blog-main',
        type: 'BLOG_FEATURE',
        order: 2,
        isVisible: true,
        settings: { source: 'latest', limit: 3 },
      }])
    })
    const local = result.current.sections

    await act(async () => {
      await result.current.save()
    })

    expect(result.current.sections).toEqual(local)
    expect(result.current.dirty).toBe(true)
    expect(result.current.saveError).toContain('بخش اول نامعتبر است.')
  })

  it('keeps local work after a 409 and blocks further saves until reload', async () => {
    mockReplace.mockRejectedValue(
      new ApiError(409, {
        statusCode: 409,
        error: 'HOMEPAGE_DRAFT_REVISION_CONFLICT',
        message: 'پیش‌نویس توسط کاربر دیگری تغییر کرده است.',
        currentRevision: 5,
        currentSchemaVersion: 1,
        currentUpdatedAt: '2026-11-09T11:00:00.000Z',
      } as never),
    )
    const { result } = renderHook(() => useHomepageDraft(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.updateSections(result.current.sections.slice(0, 1))
    })
    const local = result.current.sections

    await act(async () => {
      await result.current.save()
    })

    expect(result.current.sections).toEqual(local)
    expect(result.current.conflict).toMatchObject({
      localRevision: 3,
      currentRevision: 5,
      currentUpdatedAt: '2026-11-09T11:00:00.000Z',
    })

    mockReplace.mockClear()
    await act(async () => {
      await result.current.save()
    })
    expect(mockReplace).not.toHaveBeenCalled()
    expect(result.current.sections).toEqual(local)
  })

  it('validates local edits without a revision and marks the result outdated after further edits', async () => {
    mockValidate.mockResolvedValue({
      revision: 3,
      schemaVersion: 1,
      valid: false,
      errors: [
        {
          path: 'sections[0].settings.items',
          code: 'INVALID',
          message: 'خطا',
          severity: 'ERROR',
          category: 'STRUCTURAL',
        },
      ],
      warnings: [
        {
          path: 'sections[1].settings.limit',
          code: 'WARN',
          message: 'هشدار',
          severity: 'WARNING',
          category: 'WARNING',
        },
      ],
    })
    const { result } = renderHook(() => useHomepageDraft(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.updateSections(result.current.sections.slice(0, 1))
    })
    await act(async () => {
      await result.current.validate()
    })

    expect(mockValidate).toHaveBeenCalledWith({
      sections: result.current.sections,
    })
    expect(result.current.validationTarget).toBe('local')
    expect(result.current.validation?.errors).toHaveLength(1)
    expect(result.current.validation?.warnings).toHaveLength(1)
    expect(result.current.validationOutdated).toBe(false)

    act(() => {
      result.current.updateSections([
        ...result.current.sections,
        {
          key: 'trust-second',
          type: 'TRUST_STRIP',
          order: 1,
          isVisible: true,
          settings: { items: [] },
        },
      ])
    })
    expect(result.current.validationOutdated).toBe(true)
  })

  it('validates the saved server draft by revision when clean', async () => {
    mockValidate.mockResolvedValue({
      revision: 3,
      schemaVersion: 1,
      valid: true,
      errors: [],
      warnings: [],
    })
    const { result } = renderHook(() => useHomepageDraft(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.validate()
    })

    expect(mockValidate).toHaveBeenCalledWith({ revision: 3 })
    expect(result.current.validationTarget).toBe('server')
  })

  it('reloads the server draft explicitly and replaces local work', async () => {
    const { result } = renderHook(() => useHomepageDraft(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.updateSections([])
    })
    expect(result.current.sections).toHaveLength(0)

    mockGet.mockResolvedValue({ ...draft, revision: 7 })
    await act(async () => {
      await result.current.load()
    })

    expect(result.current.revision).toBe(7)
    expect(result.current.sections).toHaveLength(2)
    expect(result.current.dirty).toBe(false)
  })

  it('applies publication-time server validation and invalidates it after an edit', async () => {
    const { result } = renderHook(() => useHomepageDraft(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.applyValidationResult({
        revision: 3,
        schemaVersion: 1,
        valid: false,
        errors: [
          {
            path: 'sections[0].settings.items',
            code: 'EMPTY',
            message: 'نوار اعتماد خالی است.',
            severity: 'ERROR',
            category: 'STRUCTURAL',
          },
        ],
        warnings: [],
      })
    })

    expect(result.current.validationTarget).toBe('server')
    expect(result.current.validation?.errors).toHaveLength(1)
    expect(result.current.validationOutdated).toBe(false)

    act(() => {
      result.current.updateSections([])
    })
    expect(result.current.validationOutdated).toBe(true)
  })

  it('prevents duplicate saves while a save is pending', async () => {
    let resolveSave: (value: HomepageDraftDto) => void = () => {}
    mockReplace.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        }),
    )
    const { result } = renderHook(() => useHomepageDraft(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.updateSections(result.current.sections.slice(0, 1)))

    let first: Promise<boolean> = Promise.resolve(false)
    act(() => {
      first = result.current.save()
      void result.current.save()
    })
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1))
    await act(async () => {
      resolveSave({ ...draft, revision: 4, sections: result.current.sections })
      await first
    })
  })
})
