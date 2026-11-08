const DENIED_KEY_PATTERN =
  /(password|passwd|secret|token|refresh|otp|verificationcode|verification_code|hash|storagekey|storage_key|path|filepath|file_path)/i

/**
 * Exact sensitive keys whose names do not match the broad pattern above.
 * Exact matching matters: the safe boolean `nationalIdChanged` must remain
 * visible while any raw National ID key is dropped.
 */
const DENIED_EXACT_KEYS = new Set([
  'nationalid',
  'national_id',
  'codemelli',
  'code_melli',
  'mellicode',
  'melli_code',
])

function isDeniedKey(key: string): boolean {
  const normalized = key.replace(/[\s-]/g, '').toLowerCase()
  return DENIED_EXACT_KEYS.has(normalized) || DENIED_KEY_PATTERN.test(key)
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  )
}

export type SanitizedAuditPayload = Record<string, string | number | boolean>

export function sanitizeAuditPayload(
  payload: Record<string, unknown> | null | undefined,
): SanitizedAuditPayload | null {
  if (!payload) {
    return null
  }

  const result: SanitizedAuditPayload = {}
  for (const [key, value] of Object.entries(payload)) {
    if (isDeniedKey(key)) {
      continue
    }
    if (isPrimitive(value)) {
      result[key] = value
    }
  }
  return Object.keys(result).length > 0 ? result : null
}
