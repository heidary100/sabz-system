// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { MerchCampaignDto } from '@sabz/types'
import { MerchandisingCampaignEditorPage } from './merchandising-campaign-editor-page'
import {
  createMerchCampaign,
  updateMerchCampaign,
} from '../../services/merchandising'

const detailHook = vi.hoisted(() => ({
  campaign: null as MerchCampaignDto | null,
  loading: false,
  error: null as unknown,
  refetch: vi.fn(),
  replaceCampaign: vi.fn(),
}))

vi.mock('../../hooks/use-merch-campaign-detail', () => ({
  useMerchCampaignDetail: () => detailHook,
}))

vi.mock('../../services/merchandising', () => ({
  createMerchCampaign: vi.fn(),
  updateMerchCampaign: vi.fn(),
  enableMerchCampaign: vi.fn(),
  disableMerchCampaign: vi.fn(),
  archiveMerchCampaign: vi.fn(),
}))

const mockCreate = vi.mocked(createMerchCampaign)
const mockUpdate = vi.mocked(updateMerchCampaign)

function campaign(overrides: Partial<MerchCampaignDto> = {}): MerchCampaignDto {
  return {
    id: 'campaign-1',
    internalName: 'کمپین پاییز',
    type: 'SEASONAL',
    titleFa: 'پاییز گرم',
    eyebrowFa: 'جدید',
    subtitleFa: null,
    descriptionFa: null,
    ctaLabelFa: null,
    cta: { kind: 'NONE' },
    isEnabled: true,
    startsAt: null,
    endsAt: null,
    priority: 0,
    status: 'ACTIVE_WINDOW',
    scheduleStatus: 'ACTIVE',
    isArchived: false,
    archivedAt: null,
    updatedAt: '2026-11-09T10:00:00.000Z',
    products: [],
    categories: [],
    brands: [],
    media: [],
    usage: { currentPublications: [], scheduledPublications: [] },
    hasUnpublishedChanges: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-11-09T10:00:00.000Z',
    ...overrides,
  }
}

function renderEditor(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/merchandising/campaigns/new"
          element={<MerchandisingCampaignEditorPage />}
        />
        <Route
          path="/merchandising/campaigns/:id"
          element={<MerchandisingCampaignEditorPage />}
        />
        <Route
          path="/merchandising/campaigns"
          element={<div>CAMPAIGN LIST</div>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

function renderNewEditor() {
  return render(
    <MemoryRouter initialEntries={['/merchandising/campaigns/new']}>
      <Routes>
        <Route
          path="/merchandising/campaigns/new"
          element={<MerchandisingCampaignEditorPage />}
        />
        <Route
          path="/merchandising/campaigns/:id"
          element={<div>EDITOR DESTINATION</div>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MerchandisingCampaignEditorPage (SS-275)', () => {
  beforeEach(() => {
    detailHook.campaign = null
    detailHook.loading = false
    detailHook.error = null
    detailHook.refetch = vi.fn()
    detailHook.replaceCampaign = vi.fn()
    mockCreate.mockReset()
    mockUpdate.mockReset()
  })

  afterEach(() => {
    cleanup()
    document.documentElement.dir = ''
  })

  it('creates a campaign with only the supported settings fields', async () => {
    mockCreate.mockResolvedValue(campaign())
    renderNewEditor()

    fireEvent.change(await screen.findByLabelText('نام داخلی'), {
      target: { value: 'کمپین جدید' },
    })
    fireEvent.change(screen.getByLabelText('عنوان فارسی'), {
      target: { value: 'عنوان جدید' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ایجاد و ادامه' }))

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        internalName: 'کمپین جدید',
        type: 'SEASONAL',
        titleFa: 'عنوان جدید',
        cta: { kind: 'NONE' },
        isEnabled: true,
        priority: 0,
      }),
    )
    expect(await screen.findByText('EDITOR DESTINATION')).toBeTruthy()
  })

  it('blocks creation with missing required fields', async () => {
    renderNewEditor()

    fireEvent.click(await screen.findByRole('button', { name: 'ایجاد و ادامه' }))
    expect(mockCreate).not.toHaveBeenCalled()
    expect(screen.getByText('نام داخلی الزامی است.')).toBeTruthy()
    expect(screen.getByText('عنوان فارسی الزامی است.')).toBeTruthy()
  })

  it('saves only the changed fields through a partial PATCH', async () => {
    detailHook.campaign = campaign()
    mockUpdate.mockResolvedValue(campaign({ titleFa: 'عنوان ویرایش‌شده' }))
    renderEditor('/merchandising/campaigns/campaign-1')

    const title = await screen.findByLabelText('عنوان فارسی')
    expect((title as HTMLInputElement).value).toBe('پاییز گرم')
    fireEvent.change(title, { target: { value: 'عنوان ویرایش‌شده' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }))

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('campaign-1', {
        titleFa: 'عنوان ویرایش‌شده',
      }),
    )
    expect(detailHook.replaceCampaign).toHaveBeenCalled()
  })

  it('shows a validation error and keeps the form editable', async () => {
    detailHook.campaign = campaign()
    renderEditor('/merchandising/campaigns/campaign-1')

    const title = await screen.findByLabelText('عنوان فارسی')
    fireEvent.change(title, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }))
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(screen.getByText('عنوان فارسی الزامی است.')).toBeTruthy()
    expect((title as HTMLInputElement).disabled).toBe(false)
  })

  it('disables archive when the campaign is used by a current publication', async () => {
    detailHook.campaign = campaign({
      usage: {
        currentPublications: [
          {
            id: 'pub-1',
            version: 2,
            status: 'PUBLISHED',
            publishAt: null,
            publishedAt: '2026-11-09T10:00:00.000Z',
          },
        ],
        scheduledPublications: [],
      },
    })
    renderEditor('/merchandising/campaigns/campaign-1')

    expect(
      await screen.findByText(/بایگانی آن مسدود است/),
    ).toBeTruthy()
    expect(
      (
        screen.getByRole('button', { name: 'بایگانی' }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('opens the selections and media tabs for the full editor', async () => {
    detailHook.campaign = campaign({
      products: [
        { id: 'product-1', name: 'محصول یک', slug: 'product-1', sortOrder: 0 },
      ],
      categories: [
        {
          id: 'category-1',
          name: 'دسته یک',
          slug: 'category-1',
          sortOrder: 0,
        },
      ],
      brands: [
        { id: 'brand-1', name: 'برند یک', slug: 'brand-1', sortOrder: 0 },
      ],
    })
    renderEditor('/merchandising/campaigns/campaign-1')
    await screen.findByLabelText('نام داخلی')

    fireEvent.click(screen.getByRole('tab', { name: 'انتخاب‌ها' }))
    expect(screen.getByText('محصول یک')).toBeTruthy()
    expect(screen.getByText('دسته یک')).toBeTruthy()
    expect(screen.getByText('برند یک')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'رسانه' }))
    expect(screen.getByText('رسانه‌ای به این کمپین تخصیص نیافته است.')).toBeTruthy()
  })

  it('implements roving tab focus, Arrow/Home/End keys, and panel association', async () => {
    detailHook.campaign = campaign()
    renderEditor('/merchandising/campaigns/campaign-1')
    await screen.findByLabelText('نام داخلی')

    const settingsTab = screen.getByRole('tab', { name: 'تنظیمات' })
    const selectionsTab = screen.getByRole('tab', { name: 'انتخاب‌ها' })
    const auditTab = screen.getByRole('tab', { name: 'گردش فعالیت' })

    expect(settingsTab.getAttribute('aria-selected')).toBe('true')
    expect(settingsTab.tabIndex).toBe(0)
    expect(selectionsTab.tabIndex).toBe(-1)

    settingsTab.focus()
    fireEvent.keyDown(settingsTab, { key: 'ArrowLeft' })
    expect(auditTab.getAttribute('aria-selected')).toBe('true')
    expect(auditTab.tabIndex).toBe(0)
    expect(settingsTab.tabIndex).toBe(-1)
    expect(document.activeElement).toBe(auditTab)

    fireEvent.keyDown(auditTab, { key: 'Home' })
    expect(settingsTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(settingsTab)

    fireEvent.keyDown(settingsTab, { key: 'End' })
    expect(auditTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(auditTab)

    fireEvent.keyDown(auditTab, { key: 'ArrowRight' })
    expect(settingsTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(settingsTab)

    const activePanel = document.getElementById('campaign-panel-settings')
    expect(activePanel).toBeTruthy()
    expect(activePanel?.getAttribute('aria-labelledby')).toBe(
      'campaign-tab-settings',
    )
    expect(activePanel?.hasAttribute('hidden')).toBe(false)
    expect(
      document.getElementById('campaign-panel-selections')?.hasAttribute(
        'hidden',
      ),
    ).toBe(true)

    fireEvent.click(screen.getByRole('tab', { name: 'وضعیت و استفاده' }))
    const usagePanel = document.getElementById('campaign-panel-usage')!
    expect(usagePanel.tabIndex).toBe(0)
    expect(
      document.getElementById('campaign-panel-settings')?.hasAttribute(
        'tabindex',
      ),
    ).toBe(false)
  })

  it('maps horizontal arrows to the visual RTL tab direction', async () => {
    document.documentElement.dir = 'rtl'
    detailHook.campaign = campaign()
    renderEditor('/merchandising/campaigns/campaign-1')
    await screen.findByLabelText('نام داخلی')

    const settingsTab = screen.getByRole('tab', { name: 'تنظیمات' })
    const selectionsTab = screen.getByRole('tab', { name: 'انتخاب‌ها' })
    settingsTab.focus()
    fireEvent.keyDown(settingsTab, { key: 'ArrowLeft' })
    expect(selectionsTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(selectionsTab)

    fireEvent.keyDown(selectionsTab, { key: 'ArrowRight' })
    expect(settingsTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(settingsTab)
  })

  it('associates invalid fields with rendered errors and keeps descriptions', async () => {
    detailHook.campaign = campaign()
    renderEditor('/merchandising/campaigns/campaign-1')

    const title = await screen.findByLabelText('عنوان فارسی')
    fireEvent.change(title, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }))

    expect(title.getAttribute('aria-invalid')).toBe('true')
    const describedBy = title.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      'عنوان فارسی الزامی است.',
    )

    const internalName = screen.getByLabelText('نام داخلی')
    expect(internalName.getAttribute('aria-invalid')).toBeNull()
    const descriptionIds = internalName
      .getAttribute('aria-describedby')
      ?.split(' ') ?? []
    expect(
      descriptionIds.some((id) =>
        document.getElementById(id)?.textContent?.includes(
          'فقط برای شناسایی در پنل مدیریت',
        ),
      ),
    ).toBe(true)
  })
})
