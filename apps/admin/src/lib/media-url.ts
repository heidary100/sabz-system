import { API_BASE_URL } from '../services/api'

/** Resolve an API-relative media URL against the configured API origin. */
export function adminMediaUrl(path: string | null): string | null {
  if (!path) {
    return null
  }
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  const base = /^https?:\/\//i.test(API_BASE_URL)
    ? API_BASE_URL
    : window.location.origin
  try {
    return new URL(path, base).toString()
  } catch {
    return path
  }
}
