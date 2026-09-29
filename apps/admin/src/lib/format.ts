const dateFormatter = new Intl.DateTimeFormat('fa-IR', {
  calendar: 'persian',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('fa-IR', {
  calendar: 'persian',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—'
  }
  try {
    return dateFormatter.format(new Date(iso))
  } catch {
    return iso
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—'
  }
  try {
    return dateTimeFormatter.format(new Date(iso))
  } catch {
    return iso
  }
}

const rialFormatter = new Intl.NumberFormat('fa-IR')

/**
 * Formats a Rial Decimal string for the admin (SS-240A). The admin stays
 * Rial (master-plan standing decision) — the storefront alone converts to
 * Toman via its own currency helper.
 */
export function formatRial(rial: string | null | undefined): string {
  if (rial === null || rial === undefined || rial === '') {
    return '—'
  }
  const value = Number(rial)
  if (!Number.isFinite(value)) {
    return rial
  }
  return `${rialFormatter.format(value)} ریال`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} بایت`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} کیلوبایت`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`
}