// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { HomepageValidationIssue } from '@sabz/types'
import { ReadyToShipSectionForm } from './ready-to-ship-section-form'
import { TrustStripSectionForm } from './trust-strip-section-form'
import { ProductRailSectionForm } from './product-rail-section-form'

const issues: HomepageValidationIssue[] = [
  {
    path: 'sections[0].settings.title',
    code: 'INVALID_STRING',
    message: 'عنوان بخش اول نامعتبر است.',
    severity: 'ERROR',
    category: 'STRUCTURAL',
  },
  {
    path: 'sections[1].settings.title',
    code: 'INVALID_STRING',
    message: 'عنوان بخش دوم نامعتبر است.',
    severity: 'ERROR',
    category: 'STRUCTURAL',
  },
]

describe('homepage section form accessibility', () => {
  afterEach(cleanup)

  it('keeps repeated section instances uniquely labelled and described', () => {
    render(
      <>
        <ReadyToShipSectionForm
          section={{
            key: 'ready-one',
            type: 'READY_TO_SHIP',
            order: 0,
            isVisible: true,
            settings: { limit: 4, title: 'یک' },
          }}
          issues={issues}
          basePath="sections[0].settings"
          onSettingsChange={() => {}}
        />
        <ReadyToShipSectionForm
          section={{
            key: 'ready-two',
            type: 'READY_TO_SHIP',
            order: 1,
            isVisible: true,
            settings: { limit: 6, title: 'دو' },
          }}
          issues={issues}
          basePath="sections[1].settings"
          onSettingsChange={() => {}}
        />
      </>,
    )

    const titles = screen.getAllByLabelText('عنوان (اختیاری)')
    expect(titles).toHaveLength(2)
    const [first, second] = titles as HTMLInputElement[]
    expect(first!.id).not.toBe(second!.id)
    expect(document.querySelector(`label[for="${first!.id}"]`)).toBeTruthy()
    expect(document.querySelector(`label[for="${second!.id}"]`)).toBeTruthy()

    expect(first!.getAttribute('aria-invalid')).toBe('true')
    expect(second!.getAttribute('aria-invalid')).toBe('true')

    const firstIds = first!.getAttribute('aria-describedby')!.split(' ')
    const secondIds = second!.getAttribute('aria-describedby')!.split(' ')
    expect(firstIds).not.toEqual(secondIds)
    const firstTexts = firstIds.map(
      (id) => document.getElementById(id)?.textContent ?? '',
    )
    const secondTexts = secondIds.map(
      (id) => document.getElementById(id)?.textContent ?? '',
    )
    expect(firstTexts).toContain('عنوان بخش اول نامعتبر است.')
    expect(secondTexts).toContain('عنوان بخش دوم نامعتبر است.')

    // Existing descriptions remain associated alongside the error.
    expect(firstTexts.some((text) => text.includes('حداکثر ۱۲۰'))).toBe(true)
  })

  it('marks invalid trust item fields and points at their own error nodes', () => {
    render(
      <TrustStripSectionForm
        section={{
          key: 'trust-one',
          type: 'TRUST_STRIP',
          order: 0,
          isVisible: true,
          settings: {
            items: [
              { icon: 'shield', title: '' },
              { icon: 'shield', title: 'دوم' },
            ],
          },
        }}
        issues={[
          {
            path: 'sections[0].settings.items[0].title',
            code: 'INVALID_STRING',
            message: 'عنوان آیتم اول الزامی است.',
            severity: 'ERROR',
            category: 'STRUCTURAL',
          },
        ]}
        basePath="sections[0].settings"
        onSettingsChange={() => {}}
      />,
    )

    const titles = screen.getAllByLabelText('عنوان') as HTMLInputElement[]
    expect(titles[0]!.getAttribute('aria-invalid')).toBe('true')
    expect(titles[1]!.getAttribute('aria-invalid')).toBeNull()
    const errorId = titles[0]!.getAttribute('aria-describedby')!
    expect(document.getElementById(errorId)?.textContent).toBe(
      'عنوان آیتم اول الزامی است.',
    )
  })

  it('associates product-rail source errors with their picker controls', () => {
    render(
      <ProductRailSectionForm
        section={{
          key: 'rail',
          type: 'PRODUCT_RAIL',
          order: 0,
          isVisible: true,
          settings: {
            title: 'ریل',
            source: {
              kind: 'query',
              categoryId: null,
              brandId: null,
              sort: 'newest',
              limit: 8,
              inStockOnly: false,
            },
          },
        }}
        issues={[
          {
            path: 'sections[0].settings.source.categoryId',
            code: 'CATEGORY_REQUIRED',
            message: 'دسته‌بندی منبع نامعتبر است.',
            severity: 'ERROR',
            category: 'INELIGIBLE_REFERENCE',
          },
          {
            path: 'sections[0].settings.source.brandId',
            code: 'BRAND_REQUIRED',
            message: 'برند منبع نامعتبر است.',
            severity: 'ERROR',
            category: 'INELIGIBLE_REFERENCE',
          },
        ]}
        basePath="sections[0].settings"
        onSettingsChange={() => {}}
      />,
    )

    const categoryButton = screen.getByRole('button', {
      name: 'انتخاب دسته‌بندی',
    })
    const categoryErrorId = categoryButton.getAttribute('aria-describedby')
    expect(categoryErrorId).toBeTruthy()
    expect(document.getElementById(categoryErrorId!)?.textContent).toBe(
      'دسته‌بندی منبع نامعتبر است.',
    )

    const brandButton = screen.getByRole('button', { name: 'انتخاب برند' })
    const brandErrorId = brandButton.getAttribute('aria-describedby')
    expect(brandErrorId).toBeTruthy()
    expect(document.getElementById(brandErrorId!)?.textContent).toBe(
      'برند منبع نامعتبر است.',
    )
  })
})
