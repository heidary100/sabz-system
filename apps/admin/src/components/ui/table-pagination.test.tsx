// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TablePagination } from './table-pagination'

describe('TablePagination page size (SS-272)', () => {
  afterEach(cleanup)

  it('hides the size select when the route has no limit support', () => {
    render(
      <TablePagination
        position="top"
        page={1}
        totalPages={2}
        total={25}
        onPageChange={() => {}}
        totalLabel="سفارش"
      />,
    )

    expect(screen.queryByLabelText('تعداد در هر صفحه (بالا)')).toBeNull()
  })

  it('renders the page-size options supplied by the route', () => {
    render(
      <TablePagination
        position="top"
        page={1}
        totalPages={5}
        total={200}
        limit={20}
        limitOptions={[20, 50]}
        onPageChange={() => {}}
        onLimitChange={() => {}}
        totalLabel="سفارش"
      />,
    )

    const select = screen.getByLabelText('تعداد در هر صفحه (بالا)')
    expect(select).toBeTruthy()
    expect(screen.getByRole('option', { name: '۲۰' })).toBeTruthy()
    expect(screen.getByRole('option', { name: '۵۰' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: '۱۰۰' })).toBeNull()
  })

  it('reports the selected page size as a number', () => {
    const onLimitChange = vi.fn()
    render(
      <TablePagination
        position="bottom"
        page={1}
        totalPages={5}
        total={200}
        limit={20}
        limitOptions={[20, 50, 100]}
        onPageChange={() => {}}
        onLimitChange={onLimitChange}
        totalLabel="کاربر"
      />,
    )

    fireEvent.change(screen.getByLabelText('تعداد در هر صفحه (پایین)'), {
      target: { value: '50' },
    })
    expect(onLimitChange).toHaveBeenCalledWith(50)
  })

  it('keeps top and bottom controls distinguishable for assistive tech', () => {
    render(
      <>
        <TablePagination
          position="top"
          page={2}
          totalPages={3}
          total={60}
          limit={20}
          onPageChange={() => {}}
          onLimitChange={() => {}}
          totalLabel="مورد"
        />
        <TablePagination
          position="bottom"
          page={2}
          totalPages={3}
          total={60}
          limit={20}
          onPageChange={() => {}}
          onLimitChange={() => {}}
          totalLabel="مورد"
        />
      </>,
    )

    expect(screen.getByLabelText('تعداد در هر صفحه (بالا)')).toBeTruthy()
    expect(screen.getByLabelText('تعداد در هر صفحه (پایین)')).toBeTruthy()
  })
})

describe('TablePagination navigation (SS-268)', () => {
  afterEach(cleanup)

  it('disables prev on the first page and next on the last page', () => {
    const { rerender } = render(
      <TablePagination position="top" page={1} totalPages={3} total={30} onPageChange={() => {}} />,
    )
    expect((screen.getByRole('button', { name: 'صفحه قبلی' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect((screen.getByRole('button', { name: 'صفحه بعد' }) as HTMLButtonElement).disabled).toBe(
      false,
    )

    rerender(
      <TablePagination position="top" page={3} totalPages={3} total={30} onPageChange={() => {}} />,
    )
    expect((screen.getByRole('button', { name: 'صفحه قبلی' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    expect((screen.getByRole('button', { name: 'صفحه بعد' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('reports the adjacent page from the chevrons', () => {
    const onPageChange = vi.fn()
    render(
      <TablePagination
        position="bottom"
        page={2}
        totalPages={3}
        total={30}
        onPageChange={onPageChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'صفحه قبلی' }))
    fireEvent.click(screen.getByRole('button', { name: 'صفحه بعد' }))
    expect(onPageChange.mock.calls).toEqual([[1], [3]])
  })

  it('points the RTL chevrons in the reading direction', () => {
    render(
      <TablePagination position="top" page={2} totalPages={3} total={30} onPageChange={() => {}} />,
    )
    expect(
      screen
        .getByRole('button', { name: 'صفحه قبلی' })
        .querySelector('svg')
        ?.classList.contains('lucide-chevron-right'),
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: 'صفحه بعد' })
        .querySelector('svg')
        ?.classList.contains('lucide-chevron-left'),
    ).toBe(true)
  })

  it('hides the pager and jump input when there is a single page', () => {
    render(
      <TablePagination position="top" page={1} totalPages={1} total={5} onPageChange={() => {}} />,
    )
    expect(screen.queryByRole('button', { name: 'صفحه بعد' })).toBeNull()
    expect(screen.queryByLabelText('شماره صفحه (بالا)')).toBeNull()
    // The totals/pager position stays visible — there is still a result set.
    expect(screen.getByText('صفحه ۱ از ۱')).toBeTruthy()
  })

  it('hides the total pill for an empty result set', () => {
    const { container } = render(
      <TablePagination position="top" page={1} totalPages={1} total={0} onPageChange={() => {}} />,
    )
    expect(container.querySelector('[aria-live]')).toBeNull()
  })

  it('clamps a go-to-page submit into range and clears the field', () => {
    const onPageChange = vi.fn()
    render(
      <TablePagination
        position="top"
        page={2}
        totalPages={5}
        total={100}
        onPageChange={onPageChange}
      />,
    )
    const input = screen.getByLabelText('شماره صفحه (بالا)') as HTMLInputElement

    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onPageChange).toHaveBeenCalledWith(5)
    expect(input.value).toBe('')
  })

  it('strips non-digits and ignores an empty submit', () => {
    const onPageChange = vi.fn()
    render(
      <TablePagination
        position="top"
        page={2}
        totalPages={5}
        total={100}
        onPageChange={onPageChange}
      />,
    )
    const input = screen.getByLabelText('شماره صفحه (بالا)') as HTMLInputElement

    fireEvent.change(input, { target: { value: '1a2' } })
    expect(input.value).toBe('12')

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPageChange).not.toHaveBeenCalled()
  })

  it('disables every control while a request is in flight', () => {
    render(
      <TablePagination
        position="top"
        page={2}
        totalPages={5}
        total={100}
        limit={20}
        onPageChange={() => {}}
        onLimitChange={() => {}}
        disabled
      />,
    )

    expect(
      (screen.getByLabelText('تعداد در هر صفحه (بالا)') as HTMLSelectElement).disabled,
    ).toBe(true)
    expect((screen.getByLabelText('شماره صفحه (بالا)') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'صفحه بعد' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('exposes a single live region when both bars are rendered', () => {
    const { container } = render(
      <>
        <TablePagination position="top" page={1} totalPages={3} total={60} onPageChange={() => {}} />
        <TablePagination
          position="bottom"
          page={1}
          totalPages={3}
          total={60}
          onPageChange={() => {}}
        />
      </>,
    )

    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
  })
})
