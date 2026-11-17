import type { ShippingMethodCode } from '@sabz/types';
import { buildCarrierTrackingUrl } from '@/lib/carrier-tracking';
import { shippingMethodLabel } from '@/lib/orders';

/**
 * Tracking-number value (SS-262): a link only when the shipment method has
 * a supported carrier template AND the number fits that carrier's format.
 * TIPAX is live-enabled; Iran Post stays plain text until its archive-derived
 * template passes the in-region verification gate. Every other case keeps
 * the number as readable plain text in the existing order-detail row.
 */
export function TrackingNumberValue({
  method,
  trackingNumber,
}: {
  method: ShippingMethodCode;
  trackingNumber: string;
}) {
  const display = trackingNumber.trim();
  if (display === '') {
    return null;
  }

  const href = buildCarrierTrackingUrl(method, display);
  if (href === null) {
    return (
      <span
        dir="ltr"
        translate="no"
        className="break-all font-semibold text-fg"
      >
        {display}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-control font-semibold text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span dir="ltr" translate="no" className="break-all">
        {display}
      </span>
      <span className="sr-only">
        {' '}
        (پیگیری مرسوله با {shippingMethodLabel(method)} — باز شدن در پنجره جدید)
      </span>
    </a>
  );
}
