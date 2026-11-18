import * as DatePickerModule from 'react-multi-date-picker'
import * as DateObjectModule from 'react-date-object'
import * as PersianCalendarModule from 'react-date-object/calendars/persian'
import * as PersianLocaleModule from 'react-date-object/locales/persian_fa'
import * as TimePickerModule from 'react-multi-date-picker/plugins/time_picker'
import clsx from 'clsx'

function interopDefault<T>(module: unknown): T {
  const candidate = module as { default?: unknown }
  const first = candidate?.default ?? module
  const second = (first as { default?: unknown })?.default
  return (second ?? first) as T
}

const DatePicker = interopDefault<typeof import('react-multi-date-picker').default>(
  DatePickerModule,
)
const DateObject = interopDefault<typeof import('react-date-object').default>(
  DateObjectModule,
)
const persian = interopDefault<typeof import('react-date-object/calendars/persian').default>(
  PersianCalendarModule,
)
const persian_fa = interopDefault<
  typeof import('react-date-object/locales/persian_fa').default
>(PersianLocaleModule)
const TimePicker = interopDefault<
  typeof import('react-multi-date-picker/plugins/time_picker').default
>(TimePickerModule)
import { CalendarDays } from 'lucide-react'

/**
 * Jalali date/time input (SS-900).
 *
 * UI values are Jalali (fa-IR) while the API/storage boundary remains ISO/UTC.
 * The component converts at the boundary only; no Jalali display string is
 * ever stored as canonical data.
 */
export function JalaliDateTimeInput({
  id,
  value,
  onChange,
  withTime = false,
  disabled = false,
  required = false,
  ariaLabel,
  className,
}: {
  id?: string
  /** ISO-8601 value or null. */
  value: string | null
  onChange: (iso: string | null) => void
  withTime?: boolean
  disabled?: boolean
  required?: boolean
  ariaLabel?: string
  className?: string
}) {
  const selected =
    value && !Number.isNaN(new Date(value).getTime())
      ? new DateObject({
          date: new Date(value),
          calendar: persian,
          locale: persian_fa,
        })
      : null

  return (
    <div className={clsx('relative', className)} role="group" aria-label={ariaLabel}>
      <DatePicker
        id={id}
        value={selected}
        onChange={(next) => {
          const date = Array.isArray(next) ? next[0] : next
          onChange(date instanceof DateObject ? date.toDate().toISOString() : null)
        }}
        calendar={persian}
        locale={persian_fa}
        format={withTime ? 'YYYY/MM/DD HH:mm' : 'YYYY/MM/DD'}
        plugins={
          withTime
            ? [
                <TimePicker
                  key="time"
                  position="bottom"
                  hideSeconds
                />,
              ]
            : []
        }
        calendarPosition="bottom-start"
        disabled={disabled}
        required={required}
        containerClassName="w-full"
        inputClass="w-full rounded-control border-0 bg-surface-strong px-3 py-2 pe-10 text-sm text-foreground ring-1 ring-inset ring-border-control placeholder:text-muted focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60"
      />
      <CalendarDays
        className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-muted"
        aria-hidden="true"
      />
    </div>
  )
}
