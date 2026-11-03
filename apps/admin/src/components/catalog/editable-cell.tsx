import clsx from 'clsx'
import {
  applyMoneyInput,
  restoreMoneyCaret,
} from '../../lib/money-input'
import { Input } from '../catalyst/input'

/**
 * One inline-editable grid cell (SS-257). Money cells (price / compareAt)
 * use the SS-265 grouping helper; stock is a plain integer input. The cell
 * reflects the row's draft status: dirty rows get an accent ring, failed
 * rows a red one. Empty compareAt = «بدون فروش ویژه» (explicit clear on
 * save); empty price/stock are reported as invalid on save, never silently
 * sent.
 */
export interface EditableCellProps {
  kind: 'price' | 'compareAtPrice' | 'stock'
  value: string
  disabled?: boolean
  status: string
  error?: string
  ariaLabel: string
  onChange: (rawValue: string) => void
}

const DIRTY_STATUSES = new Set(['dirty', 'saving', 'saved'])
const FAILED_STATUSES = new Set([
  'validation-error',
  'conflict-changed',
  'conflict-locked',
  'not-found',
])

export function EditableCell({
  kind,
  value,
  disabled = false,
  status,
  error,
  ariaLabel,
  onChange,
}: EditableCellProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const element = event.target
    if (kind === 'stock') {
      const canonical = element.value.replace(/[^\d]/g, '')
      onChange(canonical)
      return
    }
    const applied = applyMoneyInput(element.value, element.selectionStart ?? element.value.length)
    onChange(applied.state)
    restoreMoneyCaret(element, applied.caret)
  }

  return (
    <div className="min-w-28">
      <Input
        dir="ltr"
        type="text"
        inputMode="numeric"
        disabled={disabled}
        aria-label={ariaLabel}
        value={value}
        onChange={handleChange}
        className={clsx(
          'text-sm',
          DIRTY_STATUSES.has(status) && 'border-primary/60',
          FAILED_STATUSES.has(status) && 'border-red-600/70',
          disabled && 'opacity-60',
        )}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
