import type { ShippingMethodCode } from '@sabz/types';
import { toEnglishDigits } from './digits';

/**
 * Carrier tracking links (SS-262).
 *
 * TIPAX: live-verified 2026-11-08. `https://tipaxco.com/tracking?id=<value>`
 * pre-fills the tracking input. The carrier page still asks for
 * sender/receiver, identifier type (order/contract/barcode) and a CAPTCHA,
 * so this is a prefill link, not a shipment-result link.
 *
 * IRAN_POST: `?id=` is verified against 2025 archives of the official
 * portal (`#txtbSearch` was pre-filled with the 24-digit identifier). The
 * live portal was unreachable from the build/test network, so the deep link
 * stays disabled until an in-region check confirms the current portal still
 * prefills `#txtbSearch`. While disabled, the dispatcher returns null and
 * the UI keeps the number as plain text.
 *
 * Both builders are pure: fixed origins, standard URL encoding, no network
 * calls and no carrier credentials.
 */

export const TIPAX_TRACKING_URL = 'https://tipaxco.com/tracking';
export const IRAN_POST_TRACKING_URL = 'https://tracking.post.ir/';

/**
 * TIPAX publishes two identifier shapes: a 13-digit barcode/contract number
 * and a 15–25 digit tracking code. The live form's own validator
 * (`^([a-zA-Z0-9]{1,23})$` after whitespace removal) rejects values longer
 * than 23 characters, so this gate is the intersection of both documented
 * formats and what the carrier's current form can accept. 24–25 digit codes
 * are therefore intentionally left as plain text.
 */
const TIPAX_SUPPORTED = /^(?:\d{13}|\d{15,23})$/;

/**
 * Live-verification gate for the Iran Post deep link. The template is
 * archive-verified, but the live portal could not be reached from the build
 * network. Enable only after confirming in-region that `?id=` still
 * pre-fills `#txtbSearch`; until then the order-detail row stays plain text.
 */
const IRAN_POST_DEEP_LINK_ENABLED: boolean = false;

/** Iran Post domestic identifiers are 24 digits (portal input maxlength=24). */
const IRAN_POST_DOMESTIC = /^\d{24}$/;

/** UPU S10 international postal identifier: two letters, nine digits, two letters. */
const IRAN_POST_S10 = /^[A-Z]{2}\d{9}[A-Z]{2}$/;

/** Trim outer whitespace and fold Persian/Arabic-Indic digits to ASCII. */
function normalizeTrackingNumber(raw: string | null | undefined): string {
  return toEnglishDigits(raw?.trim() ?? '').trim();
}

/** Builds the verified TIPAX prefill URL, or null when the value is not supported. */
export function buildTipaxTrackingUrl(
  trackingNumber: string | null | undefined,
): string | null {
  const value = normalizeTrackingNumber(trackingNumber);
  if (!TIPAX_SUPPORTED.test(value)) {
    return null;
  }
  const url = new URL(TIPAX_TRACKING_URL);
  url.searchParams.set('id', value);
  return url.toString();
}

/** Builds the archive-derived Iran Post prefill URL, or null when unsupported. */
export function buildIranPostTrackingUrl(
  trackingNumber: string | null | undefined,
): string | null {
  const value = normalizeTrackingNumber(trackingNumber);
  const identifier = IRAN_POST_DOMESTIC.test(value)
    ? value
    : IRAN_POST_S10.test(value.toUpperCase())
      ? value.toUpperCase()
      : null;
  if (identifier === null) {
    return null;
  }
  const url = new URL(IRAN_POST_TRACKING_URL);
  url.searchParams.set('id', identifier);
  return url.toString();
}

/**
 * Dispatches on the real shipping-method enum. Unsupported methods
 * (LOCAL_DELIVERY, STORE_PICKUP, unknown/stale codes) always return null so
 * the order-detail UI keeps the tracking number as plain text.
 */
export function buildCarrierTrackingUrl(
  method: ShippingMethodCode,
  trackingNumber: string | null | undefined,
): string | null {
  switch (method) {
    case 'TIPAX':
      return buildTipaxTrackingUrl(trackingNumber);
    case 'IRAN_POST':
      return IRAN_POST_DEEP_LINK_ENABLED
        ? buildIranPostTrackingUrl(trackingNumber)
        : null;
    default:
      return null;
  }
}
