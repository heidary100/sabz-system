// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { HomepageDraftDto, HomepageDraftSection } from '@sabz/types'
import { MerchandisingHomepagePage } from './merchandising-homepage-page'

const hook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const auth = vi.hoisted(() => ({ roles: ['ADMIN'] as string[] }))
const published = vi.hoisted(() => ({
  id: 'publication-1',
  version: 2,
  status: 'PUBLISHED',
  publishAt: null,
  publishedAt: '2026-11-10T10:00:00.000Z',
  sourceDraftRevision: 3,
  rollbackFromPublicationId: null,
  note: null,
  createdBy: 'user-1',
  publishedBy: 'user-1',
  createdAt: '2026-11-10T10:00:00.000Z',
  schemaVersion: 1,
  sections: [],
}))

vi.mock('../../auth/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', roles: auth.roles },
    isAdmin: auth.roles.includes('ADMIN') || auth.roles.includes('OPERATOR'),
  }),
}))

vi.mock('../../components/merchandising/homepage/homepage-publication-section', () => ({
  HomepagePublicationSection: ({
    canPublish,
    onPublished,
  }: {
    canPublish: boolean
    onPublished: (
      publication: typeof published,
      meta: { expectedRevision: number; revisionMismatch: boolean },
    ) => Promise<void> | void
  }) => (
    <div>
      <p>بخش آمادگی انتشار {canPublish ? 'مدیر' : 'اپراتور'}</p>
      <button
        type="button"
        onClick={() =>
          void onPublished(published, {
            expectedRevision: 3,
            revisionMismatch: false,
          })
        }
      >
        شبیه‌سازی انتشار موفق
      </button>
    </div>
  ),
}))
const createdCampaign = vi.hoisted(() => ({
  id: 'campaign-a',
  internalName: 'کمپین الف',
  type: 'SEASONAL',
  titleFa: 'پیشنهاد پاییز',
  status: 'ACTIVE_WINDOW',
  scheduleStatus: 'ACTIVE',
  isEnabled: true,
  isArchived: false,
  startsAt: null,
  endsAt: null,
  priority: 0,
  archivedAt: null,
  updatedAt: '2026-11-09T10:00:00.000Z',
}))

vi.mock('../../hooks/use-homepage-draft', () => ({
  useHomepageDraft: () => hook.value,
}))

vi.mock('../../components/merchandising/homepage/homepage-campaign-picker-dialog', () => ({
  HomepageCampaignPickerDialog: ({
    open,
    onPick,
    onClose,
  }: {
    open: boolean
    onPick: (campaign: typeof createdCampaign) => void
    onClose: () => void
  }) =>
    open ? (
      <div>
        <button type="button" onClick={() => onPick(createdCampaign)}>
          انتخاب کمپین ایجاد
        </button>
        <button type="button" onClick={onClose}>
          انصراف از انتخاب کمپین
        </button>
      </div>
    ) : null,
}))

vi.mock('../../components/merchandising/homepage/homepage-campaign-section-create-dialog', () => ({
  HomepageCampaignSectionCreateDialog: ({
    open,
    type,
    onCreate,
    onClose,
  }: {
    open: boolean
    type: string | null
    onCreate: (
      settings: { campaignId: string } | { campaignIds: string[] },
    ) => string | null
    onClose: () => void
  }) =>
    open ? (
      <div>
        <button
          type="button"
          onClick={() =>
            onCreate(
              type === 'HERO_CAROUSEL'
                ? { campaignIds: ['campaign-a'] }
                : { campaignId: 'campaign-a' },
            )
          }
        >
          ایجاد بخش آزمایشی
        </button>
        <button type="button" onClick={onClose}>
          انصراف از ایجاد
        </button>
      </div>
    ) : null,
}))

const sections: HomepageDraftSection[] = [
  {
    key: 'trust-main',
    type: 'TRUST_STRIP',
    order: 0,
    isVisible: true,
    settings: { items: [] },
  },
]

const serverDraft: HomepageDraftDto = {
  revision: 3,
  schemaVersion: 1,
  sections,
  updatedAt: '2026-11-09T10:00:00.000Z',
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    serverDraft,
    sections,
    revision: 3,
    schemaVersion: 1,
    serverUpdatedAt: serverDraft.updatedAt,
    loading: false,
    error: null,
    dirty: false,
    saving: false,
    saveError: null,
    saveMessage: null,
    conflict: null,
    validating: false,
    validation: null,
    validationTarget: null,
    validationOutdated: false,
    validationError: null,
    updateSections: vi.fn(),
    applyValidationResult: vi.fn(),
    load: vi.fn(),
    save: vi.fn(),
    validate: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/merchandising/homepage']}>
      <MerchandisingHomepagePage />
    </MemoryRouter>,
  )
}

describe('MerchandisingHomepagePage (SS-276)', () => {
  beforeEach(() => {
    auth.roles = ['ADMIN']
    hook.value = state()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders loading and error states before the draft exists', () => {
    hook.value = state({ loading: true, serverDraft: null, sections: [] })
    const { rerender } = renderPage()
    expect(screen.getByText('در حال بارگذاری پیش‌نویس صفحه اصلی…')).toBeTruthy()

    hook.value = state({
      loading: false,
      serverDraft: null,
      sections: [],
      error: new Error('network'),
    })
    rerender(
      <MemoryRouter>
        <MerchandisingHomepagePage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'خطایی رخ داد. دوباره تلاش کنید.',
    )
  })

  it('renders the outline and adds a valid-default section', () => {
    const updateSections = vi.fn((next: HomepageDraftSection[]) => {
      hook.value.sections = next
      hook.value.revision = 3
    })
    hook.value = state({ updateSections, dirty: true })
    renderPage()

    expect(screen.getByText('ساختار بخش‌ها')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'افزودن بخش' }))
    expect(updateSections).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'TRUST_STRIP' }),
        expect.objectContaining({ type: 'TRUST_STRIP', order: 1 }),
      ]),
    )
    expect(screen.getByText(/آیتم‌های نوار اعتماد/)).toBeTruthy()
  })

  it('routes section-form edits through the existing draft state', () => {
    const updateSections = vi.fn()
    hook.value = state({
      updateSections,
      dirty: true,
    })
    renderPage()

    fireEvent.click(
      screen.getByRole('button', { name: 'انتخاب بخش نوار اعتماد' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'افزودن آیتم' }))

    expect(updateSections).toHaveBeenCalledWith([
      expect.objectContaining({
        key: 'trust-main',
        type: 'TRUST_STRIP',
        settings: {
          items: [{ icon: 'shield', title: '', body: undefined }],
        },
      }),
    ])
  })

  it('calls save and validate through the draft lifecycle', () => {
    const save = vi.fn()
    const validate = vi.fn()
    hook.value = state({ dirty: true, save, validate })
    renderPage()

    fireEvent.click(
      screen.getAllByRole('button', { name: 'ذخیره پیش‌نویس' })[0]!,
    )
    expect(save).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'اعتبارسنجی' }))
    expect(validate).toHaveBeenCalledOnce()
  })

  it('disables save when clean and when a conflict exists', () => {
    hook.value = state({ dirty: false })
    const { rerender } = renderPage()
    expect(
      (
        screen.getByRole('button', {
          name: 'ذخیره پیش‌نویس',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)

    hook.value = state({
      dirty: true,
      conflict: {
        errorCode: 'HOMEPAGE_DRAFT_REVISION_CONFLICT',
        message: 'نسخه سرور تغییر کرده است.',
        localRevision: 3,
        currentRevision: 4,
        currentSchemaVersion: 1,
        currentUpdatedAt: '2026-11-09T11:00:00.000Z',
      },
    })
    rerender(
      <MemoryRouter>
        <MerchandisingHomepagePage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'نسخه سرور تغییر کرده است.',
    )
    expect(
      screen.getAllByRole('button', { name: 'ذخیره پیش‌نویس' }).every(
        (button) => (button as HTMLButtonElement).disabled,
      ),
    ).toBe(true)
  })

  it('reloads the server draft only after explicit confirmation', async () => {
    const load = vi.fn()
    hook.value = state({
      dirty: true,
      load,
      conflict: {
        errorCode: 'HOMEPAGE_DRAFT_REVISION_CONFLICT',
        message: 'نسخه سرور تغییر کرده است.',
        localRevision: 3,
        currentRevision: 4,
        currentSchemaVersion: 1,
        currentUpdatedAt: null,
      },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'بارگذاری نسخه سرور و کنار گذاشتن تغییرات محلی',
      }),
    )
    await waitFor(() => expect(load).toHaveBeenCalledOnce())
  })

  it('creates campaign-backed sections through selection-first flow and marks draft dirty', () => {
    const updateSections = vi.fn()
    hook.value = state({
      sections: [],
      serverDraft: { ...serverDraft, sections: [] },
      updateSections,
    })
    renderPage()

    fireEvent.change(screen.getByLabelText('افزودن بخش'), {
      target: { value: 'HERO_CAROUSEL' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'افزودن بخش' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'انتخاب کمپین ایجاد' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'ایجاد بخش آزمایشی' }),
    )

    expect(updateSections).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'HERO_CAROUSEL',
        order: 0,
        isVisible: true,
        settings: { campaignIds: ['campaign-a'] },
        key: expect.any(String),
      }),
    ])
  })

  it('leaves the draft unchanged when campaign-backed creation is cancelled', () => {
    const updateSections = vi.fn()
    hook.value = state({
      sections: [],
      serverDraft: { ...serverDraft, sections: [] },
      updateSections,
    })
    renderPage()

    fireEvent.change(screen.getByLabelText('افزودن بخش'), {
      target: { value: 'CATEGORY_DISCOVERY' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'افزودن بخش' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'انصراف از انتخاب کمپین' }),
    )
    expect(updateSections).not.toHaveBeenCalled()
  })

  it('passes the ADMIN-only publishing capability from the session role', () => {
    auth.roles = ['ADMIN']
    const { rerender } = renderPage()
    expect(screen.getByText('بخش آمادگی انتشار مدیر')).toBeTruthy()

    auth.roles = ['OPERATOR']
    rerender(
      <MemoryRouter>
        <MerchandisingHomepagePage />
      </MemoryRouter>,
    )
    expect(screen.getByText('بخش آمادگی انتشار اپراتور')).toBeTruthy()
  })

  it('preserves unsupported section data and renders a safe unsupported state', () => {
    const unknown = {
      key: 'future-section',
      type: 'FUTURE_SECTION',
      order: 0,
      isVisible: true,
      settings: { arbitrary: true },
    } as unknown as HomepageDraftSection
    const trust = { ...sections[0]!, order: 1 }
    const updateSections = vi.fn()
    hook.value = state({
      sections: [unknown, trust],
      serverDraft: { ...serverDraft, sections: [unknown, trust] },
      updateSections,
    })
    renderPage()

    expect(screen.getByText('FUTURE_SECTION')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'انتخاب بخش FUTURE_SECTION' }),
    )
    expect(screen.getByText('بخش پشتیبانی‌نشده')).toBeTruthy()
    expect(screen.getAllByText('future-section').length).toBeGreaterThan(0)

    fireEvent.click(
      screen.getByRole('button', { name: 'انتخاب بخش نوار اعتماد' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'افزودن آیتم' }))
    expect(updateSections).toHaveBeenCalledWith([
      unknown,
      expect.objectContaining({
        key: 'trust-main',
        settings: { items: [{ icon: 'shield', title: '', body: undefined }] },
      }),
    ])
  })

  it('refreshes the draft and navigates to the publication detail after publishing', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    hook.value = state({ load })

    function LocationProbe() {
      const location = useLocation()
      return <p>مسیر فعلی: {location.pathname}</p>
    }

    render(
      <MemoryRouter initialEntries={['/merchandising/homepage']}>
        <MerchandisingHomepagePage />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'شبیه‌سازی انتشار موفق' }),
    )

    await waitFor(() => expect(load).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(
        screen.getByText(
          'مسیر فعلی: /merchandising/publications/publication-1',
        ),
      ).toBeTruthy(),
    )
  })
})
