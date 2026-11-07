import clsx from 'clsx'
import type { GridColumnKey } from '../../lib/grid-columns'
import {
  GRID_COLUMN_LABELS,
  GRID_HIDEABLE_COLUMNS,
} from '../../lib/grid-columns'

/**
 * Column visibility as a row of toggle chips (SS-257 rework feedback): every
 * hideable column is one always-visible chip; active = column shown. The
 * fixed operational core is not listed — a short caption notes it instead of
 * a dropdown the operator had to open to see anything.
 */
export interface ColumnChipsProps {
  visible: GridColumnKey[]
  onToggle: (key: GridColumnKey) => void
}

export function ColumnChips({ visible, onToggle }: ColumnChipsProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="نمایش ستون‌ها"
    >
      <span className="text-xs font-medium text-muted">ستون‌ها:</span>
      {GRID_HIDEABLE_COLUMNS.map((key) => {
        const active = visible.includes(key)
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            aria-label={`ستون ${GRID_COLUMN_LABELS[key]}`}
            className={clsx(
              'rounded-lg px-2 py-1 text-xs font-medium transition focus-ring',
              active
                ? 'bg-primary-subtle text-primary'
                : 'border border-dashed border-border text-muted hover:border-primary/40 hover:text-foreground',
            )}
            onClick={() => onToggle(key)}
          >
            {GRID_COLUMN_LABELS[key]}
          </button>
        )
      })}
      <span className="text-xs text-muted/80">
        ستون‌های اصلی (نام، SKU، موجودی، قیمت‌ها، عملیات) همیشه نمایان‌اند.
      </span>
    </div>
  )
}
