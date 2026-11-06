import { useRef, useState } from 'react'
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
 * reflects the row's draft status. Empty compareAt/barcode/variantName =
 * explicit clear on save; empty price/stock are reported as invalid on save,
 * never silently sent.
 *
 * SS-266 click-to-edit rework: at rest the cell renders as lightweight text
 * (a real button for a11y); the form control mounts only while editing.
 * With 50 rows/page this removes the always-on input chrome (≈200 mounted
 * inputs + selects) that dominated the grid's paint cost during scrolling.
 * Esc reverts to the value at the start of the editing session (which, via
 * the draft store's revert-to-server semantics, cancels the field's draft
 * when it was the server value).
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

const PENDING_STATUSES = new Set(['dirty', 'saving', 'saved'])
const FAILED_STATUSES = new Set([
  'validation-error',
  'conflict-changed',
  'conflict-locked',
  'not-found',
])

/** Cell-state classes shared by the resting and editing presentations. */
function pendingClasses(status: string): string {
  if (PENDING_STATUSES.has(status)) {
    return 'bg-primary-subtle ring-1 ring-inset ring-primary/60'
  }
  if (FAILED_STATUSES.has(status)) {
    return 'bg-red-600/10 ring-1 ring-inset ring-red-600/70'
  }
  return ''
}

/**
 * Idle min-width keeps numeric/LTR-code columns stable when values are empty
 * (price/compareAt/stock and the dir=ltr SKU/barcode); variant name sizes
 * naturally and truncates.
 */
function idleMinWidth(kind: EditableCellKind, textDir: 'ltr' | 'rtl'): string {
  if (kind !== 'text' || textDir === 'ltr') {
    return 'min-w-24'
  }
  return ''
}

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
  const [editing, setEditing] = useState(false)
  const startValueRef = useRef(value)

  const beginEditing = (): void => {
    if (disabled) {
      return
    }
    startValueRef.current = value
    setEditing(true)
  }

  const endEditing = (): void => {
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className={clsx(idleMinWidth(kind, textDir), error && 'pb-1')}>
        <button
          type="button"
          dir={kind === 'text' ? textDir : 'ltr'}
          aria-label={ariaLabel}
          disabled={disabled}
          title={value || undefined}
          onClick={beginEditing}
          onKeyDown={(event) => {
            if (event.key === 'F2') {
              event.preventDefault()
              beginEditing()
            }
          }}
          className={clsx(
            'block max-w-full truncate rounded-md px-1.5 py-0.5 text-start text-sm transition-colors',
            'hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:hover:bg-white/10',
            value === '' && 'text-muted',
            pendingClasses(status),
          )}
        >
          {value === '' ? '—' : value}
        </button>
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>
    )
  }

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
        autoFocus
        dir={kind === 'text' ? textDir : 'ltr'}
        type="text"
        inputMode={kind === 'price' || kind === 'compareAtPrice' || kind === 'stock' ? 'numeric' : 'text'}
        disabled={disabled}
        aria-label={ariaLabel}
        value={value}
        maxLength={maxLength}
        onChange={handleChange}
        onBlur={endEditing}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            onChange(startValueRef.current)
            endEditing()
          }
        }}
        className={clsx(
          'text-sm',
          PENDING_STATUSES.has(status) && 'border-primary/60',
          FAILED_STATUSES.has(status) && 'border-red-600/70',
          disabled && 'opacity-60',
        )}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}

/**
 * Compact inline price-status cell (PRICED ↔ CALL_FOR_PRICE). Draft-aware
 * through the same editCell flow; at rest it renders as a text button —
 * CALL_FOR_PRICE tinted with the (remapped) amber ramp — and mounts the
 * select only while editing (SS-266).
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
  const [editing, setEditing] = useState(false)
  const startValueRef = useRef(value)

  if (!editing) {
    return (
      <div className={clsx('min-w-32', error && 'pb-1')}>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => {
            startValueRef.current = value
            setEditing(true)
          }}
          className={clsx(
            'block max-w-full truncate rounded-md px-1.5 py-0.5 text-start text-sm transition-colors',
            'hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:hover:bg-white/10',
            value === 'CALL_FOR_PRICE' && 'text-amber-700 dark:text-amber-400',
            pendingClasses(status),
          )}
        >
          {GRID_STATUS_LABELS[value]}
        </button>
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="min-w-32">
      <Select
        autoFocus
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            onChange(startValueRef.current)
            setEditing(false)
          }
        }}
        className={clsx(
          'text-sm',
          PENDING_STATUSES.has(status) && 'border-primary/60',
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
