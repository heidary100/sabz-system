// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom'
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

function PublicationDestination() {
  const location = useLocation()
  return <p>مسیر فعلی: {location.pathname}</p>
}

function renderPage() {
  const router = createMemoryRouter(
    [
      {
        path: '/merchandising/homepage',
        element: <MerchandisingHomepagePage />,
      },
      {
        path: '/merchandising/publications/:id',
        element: <PublicationDestination />,
      },
    ],
    { initialEntries: ['/merchandising/homepage'] },
  )
  return { router, ...render(<RouterProvider router={router} />) }
}

function installMatchMedia(initialMatches = true) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  let matches = initialMatches
  const media = {
    get matches() {
      return matches
    },
    media: '(min-width: 64rem)',
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    },
    removeEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.delete(listener)
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener)
    },
    dispatchEvent: () => true,
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => media,
  })
  return {
    setMatches(next: boolean) {
      matches = next
      listeners.forEach((listener) =>
        listener({ matches: next } as MediaQueryListEvent),
      )
    },
    restore() {
      delete (window as { matchMedia?: unknown }).matchMedia
    },
  }
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
    renderPage()
    expect(screen.getByText('در حال بارگذاری پیش‌نویس صفحه اصلی…')).toBeTruthy()

    cleanup()
    hook.value = state({
      loading: false,
      serverDraft: null,
      sections: [],
      error: new Error('network'),
    })
    renderPage()
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

  it('moves focus into the configuration after adding a section', async () => {
    const updateSections = vi.fn((next: HomepageDraftSection[]) => {
      hook.value.sections = next
    })
    hook.value = state({ updateSections, dirty: true })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'افزودن بخش' }))

    await waitFor(() => {
      const heading = screen.getByRole('heading', { name: 'نوار اعتماد' })
      expect(document.activeElement).toBe(heading.closest('[role="region"]'))
    })
  })

  it('preserves field value and focus when switching desktop and mobile layouts', async () => {
    const updateSections = vi.fn((next: HomepageDraftSection[]) => {
      hook.value.sections = next
    })
    hook.value = state({ updateSections, dirty: true })
    const media = installMatchMedia(true)
    try {
      renderPage()
      const header = document.getElementById(
        'homepage-accordion-header-trust-main',
      ) as HTMLButtonElement
      fireEvent.click(header)
      fireEvent.click(screen.getByRole('button', { name: 'افزودن آیتم' }))

      act(() => media.setMatches(false))
      const title = screen.getByLabelText('عنوان') as HTMLInputElement
      fireEvent.change(title, { target: { value: 'عنوان پایدار' } })
      title.focus()

      act(() => media.setMatches(true))
      expect((screen.getByLabelText('عنوان') as HTMLInputElement).value).toBe(
        'عنوان پایدار',
      )
      expect(document.activeElement).toBe(screen.getByLabelText('عنوان'))

      act(() => media.setMatches(false))
      expect((screen.getByLabelText('عنوان') as HTMLInputElement).value).toBe(
        'عنوان پایدار',
      )
      expect(document.activeElement).toBe(screen.getByLabelText('عنوان'))
    } finally {
      media.restore()
    }
  })

  it('keeps a section picker open when switching responsive layouts', () => {
    const updateSections = vi.fn((next: HomepageDraftSection[]) => {
      hook.value.sections = next
    })
    const discovery = {
      key: 'discovery-main',
      type: 'CATEGORY_DISCOVERY',
      order: 0,
      isVisible: true,
      settings: { campaignId: '' },
    } as HomepageDraftSection
    hook.value = state({
      sections: [discovery],
      serverDraft: { ...serverDraft, sections: [discovery] },
      updateSections,
      dirty: true,
    })
    const media = installMatchMedia(true)
    try {
      renderPage()
      const header = document.getElementById(
        'homepage-accordion-header-discovery-main',
      ) as HTMLButtonElement
      fireEvent.click(header)
      fireEvent.click(screen.getByRole('button', { name: 'انتخاب کمپین' }))
      expect(screen.getByText('انتخاب کمپین ایجاد')).toBeTruthy()

      act(() => media.setMatches(false))
      expect(screen.getByText('انتخاب کمپین ایجاد')).toBeTruthy()

      act(() => media.setMatches(true))
      expect(screen.getByText('انتخاب کمپین ایجاد')).toBeTruthy()
    } finally {
      media.restore()
    }
  })

  it('routes section-form edits through the existing draft state', () => {
    const updateSections = vi.fn()
    hook.value = state({
      updateSections,
      dirty: true,
    })
    renderPage()

    fireEvent.click(
      document.getElementById('homepage-accordion-header-trust-main')!,
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

    const validateButtons = screen.getAllByRole('button', {
      name: 'اعتبارسنجی',
    })
    expect(validateButtons).toHaveLength(2)
    fireEvent.click(validateButtons[1]!)
    expect(validate).toHaveBeenCalledOnce()
  })

  it('disables save when clean and when a conflict exists', () => {
    hook.value = state({ dirty: false })
    renderPage()
    expect(
      (
        screen.getByRole('button', {
          name: 'ذخیره پیش‌نویس',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)

    cleanup()
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
    renderPage()
    expect(screen.getByRole('alert').textContent).toContain(
      'نسخه سرور تغییر کرده است.',
    )
    expect(
      screen.getAllByRole('button', { name: 'ذخیره پیش‌نویس' }).every(
        (button) => (button as HTMLButtonElement).disabled,
      ),
    ).toBe(true)
  })

  it('shows a clean mobile action bar with Save disabled and Validate available', () => {
    hook.value = state({ dirty: false })
    const media = installMatchMedia(false)
    try {
      renderPage()
      const bar = document.querySelector(
        '[data-homepage-action-bar]',
      ) as HTMLElement
      expect(bar).toBeTruthy()
      expect(bar.textContent).toContain('همه تغییرات ذخیره شده است.')
      expect(
        (within(bar).getByRole('button', {
          name: 'ذخیره پیش‌نویس',
        }) as HTMLButtonElement).disabled,
      ).toBe(true)
      expect(
        (within(bar).getByRole('button', {
          name: 'اعتبارسنجی',
        }) as HTMLButtonElement).disabled,
      ).toBe(false)
      // The header action cluster is desktop-only, so mobile exposes exactly
      // one Save and one Validate action.
      expect(
        screen.getAllByRole('button', { name: 'ذخیره پیش‌نویس' }),
      ).toHaveLength(1)
      expect(
        screen.getAllByRole('button', { name: 'اعتبارسنجی' }),
      ).toHaveLength(1)
    } finally {
      media.restore()
    }
  })

  it('keeps Save and Validate available on a dirty mobile draft', () => {
    hook.value = state({ dirty: true })
    const media = installMatchMedia(false)
    try {
      renderPage()
      const bar = document.querySelector(
        '[data-homepage-action-bar]',
      ) as HTMLElement
      expect(bar.textContent).toContain('تغییرات ذخیره‌نشده‌ای وجود دارد.')
      expect(
        (within(bar).getByRole('button', {
          name: 'ذخیره پیش‌نویس',
        }) as HTMLButtonElement).disabled,
      ).toBe(false)
      expect(
        (within(bar).getByRole('button', {
          name: 'اعتبارسنجی',
        }) as HTMLButtonElement).disabled,
      ).toBe(false)
    } finally {
      media.restore()
    }
  })

  it('disables Save and announces progress while saving on mobile', () => {
    hook.value = state({ dirty: true, saving: true })
    const media = installMatchMedia(false)
    try {
      renderPage()
      const bar = document.querySelector(
        '[data-homepage-action-bar]',
      ) as HTMLElement
      expect(bar.getAttribute('aria-busy')).toBe('true')
      const progress = within(bar).getByRole('status')
      expect(progress.textContent).toContain('در حال ذخیره پیش‌نویس…')
      expect(progress.getAttribute('aria-live')).toBe('polite')
      expect(
        (within(bar).getByRole('button', {
          name: 'در حال ذخیره…',
        }) as HTMLButtonElement).disabled,
      ).toBe(true)
      expect(
        (within(bar).getByRole('button', {
          name: 'اعتبارسنجی',
        }) as HTMLButtonElement).disabled,
      ).toBe(true)
    } finally {
      media.restore()
    }
  })

  it('retains the desktop dirty-only action bar behavior', () => {
    hook.value = state({ dirty: false })
    renderPage()
    expect(document.querySelector('[data-homepage-action-bar]')).toBeNull()
    expect(
      (screen.getByRole('button', {
        name: 'ذخیره پیش‌نویس',
      }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', {
        name: 'اعتبارسنجی',
      }) as HTMLButtonElement).disabled,
    ).toBe(false)

    cleanup()
    hook.value = state({ dirty: true })
    renderPage()
    expect(document.querySelector('[data-homepage-action-bar]')).toBeTruthy()
  })

  it('switches breakpoints with one action bar and no duplicated controls', () => {
    hook.value = state({ dirty: true })
    const media = installMatchMedia(true)
    try {
      renderPage()
      expect(
        document.querySelectorAll('[data-homepage-action-bar]'),
      ).toHaveLength(1)

      act(() => media.setMatches(false))
      expect(
        document.querySelectorAll('[data-homepage-action-bar]'),
      ).toHaveLength(1)
      expect(screen.getAllByRole('button', { name: 'ذخیره پیش‌نویس' })).toHaveLength(
        1,
      )
      expect(screen.getAllByRole('button', { name: 'اعتبارسنجی' })).toHaveLength(1)

      act(() => media.setMatches(true))
      expect(
        document.querySelectorAll('[data-homepage-action-bar]'),
      ).toHaveLength(1)
      // Desktop keeps the header cluster and dirty bar, as before.
      expect(screen.getAllByRole('button', { name: 'ذخیره پیش‌نویس' })).toHaveLength(
        2,
      )
    } finally {
      media.restore()
    }
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
    renderPage()
    expect(screen.getByText('بخش آمادگی انتشار مدیر')).toBeTruthy()

    cleanup()
    auth.roles = ['OPERATOR']
    renderPage()
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
      document.getElementById('homepage-accordion-header-future-section')!,
    )
    expect(screen.getByText('بخش پشتیبانی‌نشده')).toBeTruthy()
    expect(screen.getAllByText('future-section').length).toBeGreaterThan(0)

    fireEvent.click(
      document.getElementById('homepage-accordion-header-trust-main')!,
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
    hook.value = state({ load, dirty: true })

    const { router } = renderPage()

    fireEvent.click(
      screen.getByRole('button', { name: 'شبیه‌سازی انتشار موفق' }),
    )

    await waitFor(() => expect(load).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/merchandising/publications/publication-1',
      ),
    )
    expect(
      screen.getByText(
        'مسیر فعلی: /merchandising/publications/publication-1',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
