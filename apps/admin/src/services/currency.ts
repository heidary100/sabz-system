import type {
  CreateCurrencyRateInput,
  CurrencyCode,
  CurrencyConversionResponse,
  CurrencyRateDto,
  CurrencyRateListResponse,
} from '@sabz/types'
import { request } from './api'

export function listCurrencyRates(query: {
  currency?: CurrencyCode
  page?: number
  limit?: number
} = {}): Promise<CurrencyRateListResponse> {
  const params = new URLSearchParams()
  if (query.currency) params.set('currency', query.currency)
  if (query.page) params.set('page', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  const qs = params.toString()
  return request<CurrencyRateListResponse>(
    qs ? `/admin/currency-rates?${qs}` : '/admin/currency-rates',
  )
}

export function createCurrencyRate(
  input: CreateCurrencyRateInput,
): Promise<CurrencyRateDto> {
  return request<CurrencyRateDto>('/admin/currency-rates', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function convertCurrency(
  currency: CurrencyCode,
  amount: string,
): Promise<CurrencyConversionResponse> {
  const params = new URLSearchParams({ currency, amount })
  return request<CurrencyConversionResponse>(
    `/admin/currency-rates/convert?${params.toString()}`,
  )
}
