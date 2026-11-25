import { cache } from 'react';
import type { FooterSettings, FooterSettingsResponse } from '@sabz/types';
import { request } from './api';
import { SITE_FOOTER_TAG } from './cache-tags';

/**
 * Public footer settings (SS-900). Returns null when no admin document exists;
 * the footer then keeps its verified built-in defaults.
 */
export const fetchFooterSettings = cache(
  async (): Promise<FooterSettings | null> => {
    try {
      const response = await request<FooterSettingsResponse>(
        '/catalog/settings/footer',
        {
          next: { revalidate: 60, tags: [SITE_FOOTER_TAG] },
        } as RequestInit & { next: { revalidate: number; tags: string[] } },
      );
      return response.value;
    } catch {
      return null;
    }
  },
);
