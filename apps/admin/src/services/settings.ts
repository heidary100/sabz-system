import type {
  FooterSettings,
  FooterSettingsResponse,
  UpdateFooterSettingsInput,
} from '@sabz/types'
import { request } from './api'

export function getFooterSettings(): Promise<FooterSettingsResponse> {
  return request<FooterSettingsResponse>('/admin/settings/footer')
}

export function updateFooterSettings(
  input: UpdateFooterSettingsInput,
): Promise<FooterSettingsResponse> {
  return request<FooterSettingsResponse>('/admin/settings/footer', {
    method: 'PUT',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export const EMPTY_FOOTER_SETTINGS: FooterSettings = {
  enabled: true,
  blurb: null,
  columns: [],
  contact: { address: null, phone: null, email: null, hours: null },
  socials: [],
  legalLinks: [],
  copyright: null,
}
