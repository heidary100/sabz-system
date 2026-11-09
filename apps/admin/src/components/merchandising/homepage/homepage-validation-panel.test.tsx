// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HomepageDraftSection, HomepageDraftValidationResult } from '@sabz/types'
import { HomepageValidationPanel } from './homepage-validation-panel'

const sections: HomepageDraftSection[] = [
  {
    key: 'trust-main',
    type: 'TRUST_STRIP',
    order: 0,
    isVisible: true,
    settings: { items: [] },
  },
]

const validation: HomepageDraftValidationResult = {
  revision: 4,
  schemaVersion: 1,
  valid: false,
  errors: [
    {
      path: 'sections[0].settings.items[0].title',
      code: 'INVALID_STRING',
      message: 'عنوان آیتم الزامی است.',
      severity: 'ERROR',
      category: 'STRUCTURAL',
    },
    {
      path: 'unknown.virtual.path',
      code: 'VIRTUAL',
      message: 'مسیر ناشناخته.',
      severity: 'ERROR',
      category: 'MISSING_REFERENCE',
    },
  ],
  warnings: [
    {
      path: 'sections[0].settings.items',
      code: 'WARNING',
      message: 'هشدار بخش.',
      severity: 'WARNING',
      category: 'WARNING',
    },
  ],
}

describe('HomepageValidationPanel (SS-276)', () => {
  afterEach(cleanup)

  it('shows errors and warnings distinctly and navigates mapped issues', () => {
    const onSelectSection = vi.fn()
    render(
      <HomepageValidationPanel
        validation={validation}
        target="local"
        outdated={false}
        validationError={null}
        sections={sections}
        onSelectSection={onSelectSection}
      />,
    )

    expect(screen.getByText(/تغییرات محلی ارسال‌شده/)).toBeTruthy()
    expect(screen.getByText('۲ خطا')).toBeTruthy()
    expect(screen.getByText('۱ هشدار')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: /عنوان آیتم الزامی است/ }),
    )
    expect(onSelectSection).toHaveBeenCalledWith(0)

    expect(screen.getByText('مسائل بدون بخش مشخص')).toBeTruthy()
    expect(screen.getByText('مسیر ناشناخته.')).toBeTruthy()
  })

  it('marks outdated results and distinguishes server validation', () => {
    render(
      <HomepageValidationPanel
        validation={{ ...validation, errors: [], valid: true }}
        target="server"
        outdated
        validationError={null}
        sections={sections}
        onSelectSection={() => {}}
      />,
    )

    expect(screen.getByText(/نسخه ذخیره‌شده روی سرور/)).toBeTruthy()
    expect(screen.getByText(/نتیجه برای ویرایش‌های فعلی به‌روز نیست/)).toBeTruthy()
  })

  it('shows errors from the validation request', () => {
    render(
      <HomepageValidationPanel
        validation={null}
        target={null}
        outdated={false}
        validationError="خطای اعتبارسنجی"
        sections={sections}
        onSelectSection={() => {}}
      />,
    )
    expect(screen.getByText('خطای اعتبارسنجی')).toBeTruthy()
  })
})
