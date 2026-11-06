import { useState } from 'react'
import clsx from 'clsx'
import { Button } from '../catalyst/button'
import { Input } from '../catalyst/input'
import { Select } from '../catalyst/select'
import {
  Pagination,
  PaginationGap,
  PaginationList,
  PaginationNext,
  PaginationPage,
  PaginationPrevious,
} from './pagination'
import { pageNumbers } from '../../lib/pagination'

/**
 * Shared pagination bar (SS-268) — ONE composition for every paginated
 * admin table, rendered twice (top + bottom) from the SAME state so both
 * instances always agree. Carries: page-size select, page numbers, RTL
 * arrows, go-to-page and the totals line inside the bar (the totals used to
 * float outside the card on their own line). Pages without limit support
 * simply omit `onLimitChange`; the select then hides.
 *
 * a11y: `position` disambiguates the two duplicate control sets on one page
 * (nav aria-label «صفحه‌بندی بالا/پایین») and the go-to-page input carries
 * an instance-unique id prefix so labels never collide.
 */
export interface TablePaginationProps {
  page: number
  totalPages: number
  /** Total matching items across all pages (drives the totals line). */
  total: number
  /** Current page size; omit `onLimitChange` to hide the size select. */
  limit?: number
  limitOptions?: number[]
  onPageChange?: (page: number) => void
  onLimitChange?: (limit: number) => void
  /** Whether the bar sits above or below the table (a11y + edge styling). */
  position: 'top' | 'bottom'
  /** Noun for the totals line, e.g. «واریانت» / «سفارش». */
  totalLabel?: string
  className?: string
}

const DEFAULT_LIMIT_OPTIONS = [20, 50, 100]

export function TablePagination({
  page,
  totalPages,
  total,
  limit,
  limitOptions = DEFAULT_LIMIT_OPTIONS,
  onPageChange,
  onLimitChange,
  position,
  totalLabel = 'مورد',
  className,
}: TablePaginationProps) {
  const [pageInput, setPageInput] = useState('')
  const disabled = onPageChange === undefined

  const goToPage = (): void => {
    if (!onPageChange) return
    const target = Number.parseInt(pageInput, 10)
    if (!Number.isFinite(target)) return
    const clamped = Math.min(Math.max(target, 1), totalPages)
    setPageInput('')
    if (clamped !== page) onPageChange(clamped)
  }

  const positionLabel = position === 'top' ? 'بالا' : 'پایین'

  return (
    <div
      className={clsx(
        className,
        'flex flex-wrap items-center gap-3',
        position === 'top' ? 'mb-3 border-b border-border pb-3' : 'mt-3 border-t border-border pt-3',
      )}
    >
      <Pagination aria-label={`صفحه‌بندی ${positionLabel}`}>
        <PaginationPrevious
          disabled={page <= 1 || disabled}
          onClick={() => onPageChange?.(page - 1)}
        />
        <PaginationList>
          {pageNumbers(page, totalPages).map((item, index) =>
            item === 'gap' ? (
              <PaginationGap key={`gap-${index}`} />
            ) : (
              <PaginationPage
                key={item}
                current={item === page}
                disabled={disabled}
                onClick={() => onPageChange?.(item)}
              >
                {item}
              </PaginationPage>
            ),
          )}
        </PaginationList>
        <PaginationNext
          disabled={page >= totalPages || disabled}
          onClick={() => onPageChange?.(page + 1)}
        />
      </Pagination>

      <div className="ms-auto flex flex-wrap items-center gap-2">
        {total > 0 ? (
          <span className="text-xs text-muted" aria-live="polite">
            مجموع: {total.toLocaleString('fa-IR')} {totalLabel} · صفحه {page} از {totalPages}
          </span>
        ) : null}
        {onLimitChange && limit != null ? (
          <Select
            aria-label={`تعداد در هر صفحه (${positionLabel})`}
            value={String(limit)}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className="w-auto"
          >
            {limitOptions.map((option) => (
              <option key={option} value={String(option)}>
                {option.toLocaleString('fa-IR')} {totalLabel} در صفحه
              </option>
            ))}
          </Select>
        ) : null}
        {onPageChange && totalPages > 1 ? (
          <div className="flex items-center gap-1">
            <Input
              aria-label={`شماره صفحه (${positionLabel})`}
              dir="ltr"
              inputMode="numeric"
              placeholder={`صفحه ${page}`}
              className="w-20"
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') goToPage()
              }}
            />
            <Button outline onClick={goToPage} disabled={pageInput.trim() === ''}>
              برو
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
