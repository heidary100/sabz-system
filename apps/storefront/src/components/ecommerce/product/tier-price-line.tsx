'use client';

import { useEffect, useState } from 'react';
import type { CatalogPriceResponseDto } from '@sabz/types';
import { authFetch, hasSession } from '@/lib/auth-client';
import { formatToman } from '@/lib/format';

/**
 * Partner tier price line (SS-235 B1). Renders only for signed-in customers
 * whose APPROVED-partner tier actually lowers the selected variant's price:
 * the server resolves the full B1 chain (category rule → override → tier →
 * bulk → promotion) via the public price endpoint, so the storefront never
 * computes discounts itself. Guests, retail customers, and failures render
 * nothing — the retail price above stays the single truth.
 */
export function TierPriceLine({
  slug,
  variantId,
  basePrice,
}: {
  /** Product slug for the price endpoint. */
  slug: string;
  /** Selected variant id for the price endpoint. */
  variantId: string;
  /** Raw variant base price (Rial) for the cheaper-than comparison. */
  basePrice: string;
}) {
  // Signed-in snapshot: the panel remounts on variant navigation, so a
  // post-login appearance needs at most one navigation; guests keep the
  // initial null without any synchronous setState inside the effect below.
  const [signedIn] = useState(() => hasSession());
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) {
      return;
    }
    let cancelled = false;
    authFetch(
      `/catalog/products/${encodeURIComponent(slug)}/price?variantId=${encodeURIComponent(variantId)}`,
    )
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as CatalogPriceResponseDto;
        const quote = body.quotes[0];
        if (
          !cancelled &&
          quote &&
          body.tierApplied &&
          quote.resolvedPrice !== null &&
          Number(quote.resolvedPrice) < Number(basePrice)
        ) {
          setResolved(quote.resolvedPrice);
        } else if (!cancelled) {
          setResolved(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolved(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, slug, variantId, basePrice]);

  if (resolved === null) {
    return null;
  }
  return (
    <p className="mt-2 text-sm font-semibold text-sabz-700">
      قیمت همکار: {formatToman(resolved)}
    </p>
  );
}
