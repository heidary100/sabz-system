import { ErrorMessage } from '../catalyst/fieldset'

/**
 * Error text for fields built from Headless UI controls. It must be rendered
 * inside a Catalyst `Field`; Headless then includes its id in the control's
 * `aria-describedby` alongside any `Description` elements.
 */
export function FieldErrorMessage({
  id,
  message,
}: {
  id: string
  message?: string | null
}) {
  if (!message) {
    return null
  }
  return <ErrorMessage id={id}>{message}</ErrorMessage>
}

/**
 * Shared field-level error text for non-Headless controls or group-level
 * errors. The id is required so callers can point `aria-describedby` at the
 * exact rendered message. Nothing renders when there is no message, which
 * keeps the described-by reference meaningful.
 */
export function FieldError({
  id,
  message,
}: {
  id: string
  message?: string | null
}) {
  if (!message) {
    return null
  }
  return (
    <p id={id} className="text-sm text-danger">
      {message}
    </p>
  )
}
