/**
 * Manual FX rates (SS-900). Currency conversion is admin-side only; the
 * storefront always displays Rial. No live-market behavior is implied.
 */

export type CurrencyCode = 'USD' | 'AED';

export const CURRENCY_FA: Record<CurrencyCode, string> = {
  USD: 'دلار آمریکا',
  AED: 'درهم امارات',
};

export const CURRENCY_UNIT_FA: Record<CurrencyCode, string> = {
  USD: 'دلار',
  AED: 'درهم',
};

export interface CurrencyRateDto {
  id: string;
  currency: CurrencyCode;
  currencyFa: string;
  /** Rial per one unit, Decimal string. */
  rialPerUnit: string;
  effectiveAt: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CurrencyRateListResponse {
  items: CurrencyRateDto[];
  total: number;
  page: number;
  limit: number;
  /** Current effective values (newest row at/before now) per currency. */
  current: CurrencyRateDto[];
}

export interface CreateCurrencyRateInput {
  currency: CurrencyCode;
  rialPerUnit: string;
  effectiveAt?: string;
  note?: string;
}

export interface CurrencyConversionResponse {
  currency: CurrencyCode;
  amount: string;
  rialPerUnit: string;
  rial: string;
  effectiveAt: string;
}
