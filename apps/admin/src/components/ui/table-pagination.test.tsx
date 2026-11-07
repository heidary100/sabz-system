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
