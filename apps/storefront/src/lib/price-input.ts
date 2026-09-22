/**
 * Pure price-bound input sanitizer (SS-213).
 *
 * Folds Persian/Arabic digits to ASCII, strips group separators and
 * whitespace, and validates against the API Decimal-as-string form
 * (`PRICE_12_2_PATTERN`: up to 10 integer digits, optional 1–2 decimals).
 *
 * Returns the normalized bound, `''` for empty input (clear that bound), or
 * `null` when the input cannot become a valid bound — which must never
 * navigate. No price business logic lives here; the server is authoritative.
 */
export function sanitizePriceBound(raw: string): string | null {
  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arDigits = '٠١٢٣٤٥٦٧٨٩';
  let normalized = '';
  for (const char of raw.trim()) {
    const faIndex = faDigits.indexOf(char);
    if (faIndex >= 0) {
      normalized += String(faIndex);
      continue;
    }
    const arIndex = arDigits.indexOf(char);
    if (arIndex >= 0) {
      normalized += String(arIndex);
      continue;
    }
    normalized += char;
  }
  normalized = normalized.replace(/[,٬،\s]/g, '');
  if (normalized === '') {
    return '';
  }
  return /^\d{1,10}(?:\.\d{1,2})?$/.test(normalized) ? normalized : null;
}
