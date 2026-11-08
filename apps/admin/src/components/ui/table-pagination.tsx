import { useState } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '../catalyst/input'
import { Select } from '../catalyst/select'
import { pageNumbers } from '../../lib/pagination'

/**
 * Shared pagination bar (SS-268) — ONE composition for every paginated
 * admin table, rendered twice (top + bottom) from the SAME state so both
 * instances always agree.
 *
 * Redesign (SS-268 feedback): three balanced clusters instead of the old
 * scattered row —
 *   [count pill + page position]  ·  [segmented pager]  ·  [size · jump]
 * The segmented pager is the one deliberate accent: joined controls on a
 * raised segment, current page as the single solid ink block (not
 * clickable — you are on it), flanked by icon chevrons that point in the
 * RTL reading direction (prev →, next ←). Jump is Enter-only; the size
 * select shows bare numerals. Everything rides the semantic tokens, so
 * both themes and the density scale come for free.
 *
 * a11y: `position` disambiguates the two duplicate control sets on one
 * page (nav aria-label «صفحه‌بندی بالا/پایین») and every label carries it.
 * Routes without limit support omit `onLimitChange`; the select hides.
 */
export interface TablePaginationProps {
  page: number
  totalPages: number
  /** Total matching items across all pages (drives the count pill). */
  total: number
  /** Current page size; omit `onLimitChange` to hide the size select. */
  limit?: number
  limitOptions?: number[]
  onPageChange?: (page: number) => void
  onLimitChange?: (limit: number) => void
  /** Whether the bar sits above or below the table (a11y + edge styling). */
  position: 'top' | 'bottom'
  /** Noun for the count pill, e.g. «نوع» / «سفارش». */
  totalLabel?: string
  /** Disables every interactive control (e.g. while the list is loading). */
  disabled?: boolean
  className?: string
}

const DEFAULT_LIMIT_OPTIONS = [20, 50, 100]

const faDigits = (value: number): string => value.toLocaleString('fa-IR')

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
  disabled = false,
  className,
}: TablePaginationProps) {
  const [pageInput, setPageInput] = useState('')
  const positionLabel = position === 'top' ? 'بالا' : 'پایین'

  const goToPage = (): void => {
    if (!onPageChange) return
    const target = Number.parseInt(pageInput, 10)
    if (!Number.isFinite(target)) return
    const clamped = Math.min(Math.max(target, 1), totalPages)
    setPageInput('')
    if (clamped !== page) onPageChange(clamped)
  }

  const chevronClasses =
    'flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-primary-subtle/60 hover:text-primary focus-ring disabled:pointer-events-none disabled:opacity-40'

  return (
    <nav
      aria-label={`صفحه‌بندی ${positionLabel}`}
      className={clsx(
        className,
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2',
        position === 'top'
          ? 'mb-3 border-b border-border pb-3'
          : 'mt-3 border-t border-border pt-3',
      )}
    >
      {/* Totals cluster (RTL start). */}
      <div className="flex min-w-0 items-center gap-2">
        {total > 0 ? (
          <span
            className="rounded-lg bg-primary-subtle px-2.5 py-1 text-xs font-semibold tabular-nums text-primary"
            /* One live region per page: the bottom bar mirrors the top one, and
               two polite regions would announce every total change twice. */
            aria-live={position === 'top' ? 'polite' : undefined}
          >
            {faDigits(total)} {totalLabel}
          </span>
        ) : null}
        <span className="text-xs tabular-nums text-muted">
          صفحه {faDigits(page)} از {faDigits(totalPages)}
        </span>
      </div>

      {/* Segmented pager — hidden entirely on single-page result sets. */}
      {onPageChange && totalPages > 1 ? (
        <div
          role="group"
          aria-label={`رفتن بین صفحات (${positionLabel})`}
          className="flex max-w-full flex-wrap items-center gap-0.5 rounded-xl border border-border bg-surface-strong p-1 shadow-xs"
        >
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || disabled}
            aria-label="صفحه قبلی"
            className={chevronClasses}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
          {pageNumbers(page, totalPages).map((item, index) =>
            item === 'gap' ? (
              <span
                key={`gap-${index}`}
                aria-hidden="true"
                className="w-5 select-none text-center text-xs text-muted"
              >
                …
              </span>
            ) : item === page ? (
              <span
                key={item}
                aria-current="page"
                title={`صفحه ${faDigits(item)}`}
                className="flex size-8 items-center justify-center rounded-lg bg-primary-strong text-sm font-semibold tabular-nums text-on-primary"
              >
                {faDigits(item)}
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                disabled={disabled}
                aria-label={`صفحه ${faDigits(item)}`}
                className="flex size-8 items-center justify-center rounded-lg text-sm font-medium tabular-nums text-foreground transition-colors hover:bg-primary-subtle/60 hover:text-primary focus-ring"
              >
                {faDigits(item)}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages || disabled}
            aria-label="صفحه بعد"
            className={chevronClasses}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Size + jump cluster (RTL end). */}
      <div className="flex items-center gap-2">
        {onLimitChange && limit != null ? (
          <>
            {/* The width lives on the wrapper: Catalyst Input/Select hard-code
                `w-full` on their own wrapper, so a width class passed to them
                loses in the generated CSS order. */}
            <div className="w-20 shrink-0">
              <Select
                aria-label={`تعداد در هر صفحه (${positionLabel})`}
                value={String(limit)}
                onChange={(event) => onLimitChange(Number(event.target.value))}
                disabled={disabled}
              >
                {limitOptions.map((option) => (
                  <option key={option} value={String(option)}>
                    {faDigits(option)}
                  </option>
                ))}
              </Select>
            </div>
            <span className="text-xs text-muted">در هر صفحه</span>
          </>
        ) : null}
        {onPageChange && totalPages > 1 ? (
          <div className="w-20 shrink-0">
            <Input
              aria-label={`شماره صفحه (${positionLabel})`}
              title="رفتن به صفحه — Enter"
              dir="ltr"
              inputMode="numeric"
              placeholder="صفحه"
              disabled={disabled}
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') goToPage()
              }}
            />
          </div>
        ) : null}
      </div>
    </nav>
  )
}
