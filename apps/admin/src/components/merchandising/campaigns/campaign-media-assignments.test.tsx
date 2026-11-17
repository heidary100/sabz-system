// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MerchMediaSummaryDto } from '@sabz/types'
import { CampaignMediaAssignments } from './campaign-media-assignments'
import type { CampaignMediaDraft } from '../../../lib/merchandising-campaign'

const mediaFixture = vi.hoisted(
  (): MerchMediaSummaryDto => ({
    id: 'media-3',
    originalName: 'new-media.png',
    mimeType: 'image/png',
    sizeBytes: 1200,
    width: 800,
    height: 600,
    altFa: 'تصویر کتابخانه',
    status: 'DRAFT',
    publishedAt: null,
    createdAt: '2026-11-09T10:00:00.000Z',
    updatedAt: '2026-11-09T10:00:00.000Z',
  }),
)

vi.mock('../merch-media-thumbnail', () => ({
  MerchMediaThumbnail: () => <div data-testid="media-thumbnail" />,
}))

vi.mock('./campaign-media-picker-dialog', () => ({
  CampaignMediaPickerDialog: ({
    open,
    onPick,
  }: {
    open: boolean
    onPick: (media: MerchMediaSummaryDto) => void
  }) =>
    open ? (
      <button type="button" onClick={() => onPick(mediaFixture)}>
        انتخاب رسانه آزمایشی
      </button>
    ) : null,
}))

function assignment(
  mediaId: string,
  slot: CampaignMediaDraft['slot'],
): CampaignMediaDraft {
  return {
    mediaId,
    originalName: `${mediaId}.png`,
    mimeType: 'image/png',
    publishedAt: null,
    slot,
    altFa: '',
    focalX: '50',
    focalY: '50',
  }
}

describe('CampaignMediaAssignments (SS-275)', () => {
  afterEach(cleanup)

  it('edits slot, focal point, assignment alt, order, and removal', () => {
    const onChange = vi.fn()
    const value = [
      assignment('media-1', 'HERO_DESKTOP'),
      assignment('media-2', 'BANNER'),
    ]
    render(
      <CampaignMediaAssignments
        value={value}
        maxMedia={4}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getAllByLabelText('جایگاه')[0]!, {
      target: { value: 'HERO_MOBILE' },
    })
    expect(onChange).toHaveBeenCalledWith([
      { ...value[0], slot: 'HERO_MOBILE' },
      value[1],
    ])

    fireEvent.change(screen.getAllByLabelText('نقطه کانونی افقی')[0]!, {
      target: { value: '25' },
    })
    expect(onChange).toHaveBeenCalledWith([
      { ...value[0], focalX: '25' },
      value[1],
    ])

    fireEvent.change(screen.getAllByLabelText('متن جایگزین تخصیص (اختیاری)')[0]!, {
      target: { value: 'متن تخصیص' },
    })
    expect(onChange).toHaveBeenCalledWith([
      { ...value[0], altFa: 'متن تخصیص' },
      value[1],
    ])

    fireEvent.click(
      screen.getByRole('button', {
        name: 'جابه‌جایی media-1.png به پایین',
      }),
    )
    expect(onChange).toHaveBeenCalledWith([value[1], value[0]])

    fireEvent.click(
      screen.getByRole('button', { name: 'حذف media-2.png' }),
    )
    expect(onChange).toHaveBeenCalledWith([value[0]])
  })

  it('adds an existing media asset with the next unused slot', () => {
    const onChange = vi.fn()
    render(
      <CampaignMediaAssignments
        value={[assignment('media-3', 'HERO_DESKTOP')]}
        maxMedia={4}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'افزودن رسانه' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'انتخاب رسانه آزمایشی' }),
    )

    expect(onChange).toHaveBeenCalledWith([
      assignment('media-3', 'HERO_DESKTOP'),
      expect.objectContaining({
        mediaId: 'media-3',
        slot: 'HERO_MOBILE',
        focalX: '50',
        focalY: '50',
            }),
    ])
  })

  it('shows the maximum limit and assignment-level validation', () => {
    const value = [
      assignment('m1', 'HERO_DESKTOP'),
      assignment('m2', 'HERO_MOBILE'),
      assignment('m3', 'BANNER'),
      assignment('m4', 'EDITORIAL'),
    ]
    render(
      <CampaignMediaAssignments
        value={value}
        maxMedia={4}
        errors={[{ altFa: 'متن جایگزین بیش از حد طولانی است.' }]}
        onChange={() => {}}
      />,
    )

    expect(screen.getByText(/رسانه‌های کمپین/).textContent).toContain('۴ از ۴')
    expect(
      (
        screen.getByRole('button', {
          name: 'افزودن رسانه',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(
      screen.getByText('متن جایگزین بیش از حد طولانی است.'),
    ).toBeTruthy()
  })

  it('associates assignment errors and keeps the alt description', () => {
    render(
      <CampaignMediaAssignments
        value={[assignment('media-1', 'HERO_DESKTOP')]}
        maxMedia={4}
        errors={[
          {
            altFa: 'متن جایگزین بیش از حد طولانی است.',
            focalX: 'نقطه کانونی افقی نامعتبر است.',
          },
        ]}
        onChange={() => {}}
      />,
    )

    const alt = screen.getByLabelText(
      'متن جایگزین تخصیص (اختیاری)',
    ) as HTMLInputElement
    expect(alt.getAttribute('aria-invalid')).toBe('true')
    const altTexts = alt
      .getAttribute('aria-describedby')!
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
    expect(altTexts).toContain('متن جایگزین بیش از حد طولانی است.')
    expect(altTexts.some((text) => text.includes('کاراکتر'))).toBe(true)

    const focalX = screen.getByLabelText(
      'نقطه کانونی افقی',
    ) as HTMLInputElement
    expect(focalX.getAttribute('aria-invalid')).toBe('true')
    expect(
      document.getElementById(focalX.getAttribute('aria-describedby')!)
        ?.textContent,
    ).toBe('نقطه کانونی افقی نامعتبر است.')
  })

  it('moves focus to a surviving assignment after removal', async () => {
    const initial = [
      assignment('media-1', 'HERO_DESKTOP'),
      assignment('media-2', 'BANNER'),
    ]

    function ControlledAssignments() {
      const [value, setValue] = useState(initial)
      return (
        <CampaignMediaAssignments
          value={value}
          maxMedia={4}
          onChange={setValue}
        />
      )
    }

    render(<ControlledAssignments />)
    fireEvent.click(screen.getByRole('button', { name: 'حذف media-1.png' }))

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'حذف media-2.png' }),
      ),
    )
  })

  it('focuses the add-media control after removing the last assignment', async () => {
    function ControlledAssignments() {
      const [value, setValue] = useState([
        assignment('media-1', 'HERO_DESKTOP'),
      ])
      return (
        <CampaignMediaAssignments
          value={value}
          maxMedia={4}
          onChange={setValue}
        />
      )
    }

    render(<ControlledAssignments />)
    fireEvent.click(screen.getByRole('button', { name: 'حذف media-1.png' }))

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'افزودن رسانه' }),
      ),
    )
  })
})
