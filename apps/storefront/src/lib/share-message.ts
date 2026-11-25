import { CALL_FOR_PRICE_LABEL, formatPriceFrom, formatToman } from './format';

/**
 * Product share payload composer (SS-249, extended SS-900).
 *
 * The structured payload contains the canonical product link, name, primary
 * image, SHORT description (never the full description), brand, selected
 * variant, and customer-facing regular/discounted Rial prices. The human text
 * is built from the same values and the same card pricing rules, so a share
 * can never quote a price the storefront does not show.
 *
 * Inputs are anonymous BASE values only; tier/promotion personalization never
 * reaches this module (guest price responses pin `tierApplied: false`).
 */
export interface SharePayloadInput {
  title: string;
  shortDescription?: string | null;
  brandName?: string | null;
  variantName?: string | null;
  imageUrl?: string | null;
  /** Customer-facing Rial price; null when nothing is priced. */
  priceFromRial: string | null;
  regularPriceRial?: string | null;
  /** Total PRICED variant count — drives the «از …» rule. */
  variantCount: number;
  url: string;
}

export interface ProductSharePayload {
  title: string;
  text: string;
  url: string;
  imageUrl: string | null;
  shortDescription: string | null;
  brandName: string | null;
  variantName: string | null;
  priceRial: string | null;
  regularPriceRial: string | null;
}

export function buildShareMessage(input: SharePayloadInput): string {
  const lines: string[] = [input.title.trim()];
  const description = input.shortDescription?.trim();
  if (description) {
    lines.push(description);
  }
  const brand = input.brandName?.trim();
  if (brand) {
    lines.push(brand);
  }
  const variant = input.variantName?.trim();
  if (variant) {
    lines.push(`مدل: ${variant}`);
  }
  if (input.priceFromRial === null || input.priceFromRial === '') {
    lines.push(`قیمت: ${CALL_FOR_PRICE_LABEL}`);
  } else {
    const price =
      input.variantCount > 1
        ? formatPriceFrom(input.priceFromRial)
        : formatToman(input.priceFromRial);
    lines.push(`قیمت: ${price}`);
    if (
      input.regularPriceRial &&
      Number(input.regularPriceRial) > Number(input.priceFromRial)
    ) {
      lines.push(`قیمت عادی: ${formatToman(input.regularPriceRial)}`);
    }
  }
  lines.push(input.url);
  return lines.join('\n');
}

export function buildSharePayload(input: SharePayloadInput): ProductSharePayload {
  return {
    title: input.title.trim(),
    text: buildShareMessage(input),
    url: input.url,
    imageUrl: input.imageUrl ?? null,
    shortDescription: input.shortDescription?.trim() || null,
    brandName: input.brandName?.trim() || null,
    variantName: input.variantName?.trim() || null,
    priceRial: input.priceFromRial,
    regularPriceRial: input.regularPriceRial ?? null,
  };
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
