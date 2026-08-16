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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} بایت`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} کیلوبایت`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`
}