import { CALL_FOR_PRICE_LABEL, formatPriceFrom, formatToman } from './format';

/**
 * Share payload composer (SS-249).
 *
 * Builds the Persian message carried by Telegram/WhatsApp/Bale shares:
 * title, brand when present, the anonymous public price line, and the deep
 * link. Pricing-display consistency (engagement §12): the price line uses
 * the SAME helpers and rules as listing cards — call-for-price label when
 * nothing is priced, exact Toman for a single variant, «از …» only for a
 * genuine multi-variant spread — so a share can never quote a price the
 * storefront does not show. Confidentiality: inputs are anonymous BASE
 * values only; tier/promo personalization never reaches this module (the
 * price endpoint pins `tierApplied: false` for guests in e2e).
 */
export interface ShareMessageInput {
  title: string;
  brandName?: string | null;
  /** Rial price of the cheapest PRICED variant; null when nothing is priced. */
  priceFromRial: string | null;
  /** Total variant count — drives the «از …» multi-variant rule. */
  variantCount: number;
  url: string;
}

export function buildShareMessage(input: ShareMessageInput): string {
  const lines: string[] = [input.title.trim()];
  const brand = input.brandName?.trim();
  if (brand) {
    lines.push(brand);
  }
  if (input.priceFromRial === null || input.priceFromRial === '') {
    lines.push(`قیمت: ${CALL_FOR_PRICE_LABEL}`);
  } else {
    const price =
      input.variantCount > 1
        ? formatPriceFrom(input.priceFromRial)
        : formatToman(input.priceFromRial);
    lines.push(`قیمت: ${price}`);
  }
  lines.push(input.url);
  return lines.join('\n');
}

/**
 * The Telegram share intent renders the shared URL separately from its text
 * parameter, so the trailing URL line is dropped there to avoid duplication.
 * No-op when the message does not end with the URL.
 */
export function shareTextWithoutUrl(message: string, url: string): string {
  return message.endsWith(url)
    ? message.slice(0, -url.length).trimEnd()
    : message;
}
