import clsx from 'clsx'
import {
  applyMoneyInput,
  restoreMoneyCaret,
} from '../../lib/money-input'
import { GRID_STATUS_LABELS } from '../../lib/grid-messages'
import { Input } from '../catalyst/input'
import { Select } from '../catalyst/select'
import type { PriceStatus } from '@sabz/types'

/**
 * One inline-editable grid cell (SS-257). Money cells (price / compareAt)
 * use the SS-265 grouping helper; stock is a plain integer input; text cells
 * (SKU dir=ltr, barcode dir=ltr, variant name) are plain inputs. The cell
 * reflects the row's draft status: dirty rows get an accent ring, failed
 * rows a red one. Empty compareAt/barcode/variantName = explicit clear on
 * save; empty price/stock are reported as invalid on save, never silently
 * sent.
 */
export type EditableCellKind = 'price' | 'compareAtPrice' | 'stock' | 'text'

export interface EditableCellProps {
  kind: EditableCellKind
  value: string
  disabled?: boolean
  status: string
  error?: string
  ariaLabel: string
  /** Text-cell presentation: direction + max length (SKU/barcode/name). */
  textDir?: 'ltr' | 'rtl'
  maxLength?: number
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
  textDir = 'ltr',
  maxLength,
  onChange,
}: EditableCellProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const element = event.target
    if (kind === 'stock') {
      onChange(element.value.replace(/[^\d]/g, ''))
      return
    }
    if (kind === 'text') {
      onChange(element.value)
      return
    }
    const applied = applyMoneyInput(element.value, element.selectionStart ?? element.value.length)
    onChange(applied.state)
    restoreMoneyCaret(element, applied.caret)
  }

  return (
    <div className="min-w-28">
      <Input
        dir={kind === 'text' ? textDir : 'ltr'}
        type="text"
        inputMode={kind === 'price' || kind === 'compareAtPrice' || kind === 'stock' ? 'numeric' : 'text'}
        disabled={disabled}
        aria-label={ariaLabel}
        value={value}
        maxLength={maxLength}
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

/**
 * Compact inline price-status select (PRICED ↔ CALL_FOR_PRICE). Draft-aware
 * through the same editCell flow; failed rows keep the red ring.
 */
export interface PriceStatusCellProps {
  value: PriceStatus
  status: string
  error?: string
  ariaLabel: string
  disabled?: boolean
  onChange: (value: string) => void
}

export function PriceStatusCell({
  value,
  status,
  error,
  ariaLabel,
  disabled = false,
  onChange,
}: PriceStatusCellProps) {
  return (
    <div className="min-w-32">
      <Select
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={clsx(
          'text-sm',
          DIRTY_STATUSES.has(status) && 'border-primary/60',
          FAILED_STATUSES.has(status) && 'border-red-600/70',
        )}
      >
        <option value="PRICED">{GRID_STATUS_LABELS.PRICED}</option>
        <option value="CALL_FOR_PRICE">{GRID_STATUS_LABELS.CALL_FOR_PRICE}</option>
      </Select>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
