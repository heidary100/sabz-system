import { randomUUID } from 'crypto';
import {
  isMerchMediaSlot,
  validateCampaignCta,
  validateCampaignSelectionLimits,
  validateCampaignWindow,
} from './campaign-validation';

describe('campaign validation primitives', () => {
  it('requires endsAt to be later than startsAt', () => {
    expect(
      validateCampaignWindow(
        '2026-11-10T00:00:00.000Z',
        '2026-11-10T00:00:00.000Z',
      ).valid,
    ).toBe(false);
    expect(
      validateCampaignWindow(
        '2026-11-10T00:00:00.000Z',
        '2026-11-11T00:00:00.000Z',
      ).valid,
    ).toBe(true);
    expect(validateCampaignWindow(null, null).valid).toBe(true);
  });

  it('accepts only the supported typed CTA shapes', () => {
    expect(validateCampaignCta({ kind: 'NONE' }).valid).toBe(true);
    expect(validateCampaignCta({ kind: 'ALL_PRODUCTS' }).valid).toBe(true);
    expect(validateCampaignCta({ kind: 'NEW_ARRIVALS' }).valid).toBe(true);
    expect(
      validateCampaignCta({ kind: 'PRODUCT', productId: randomUUID() }).valid,
    ).toBe(true);
    expect(
      validateCampaignCta({ kind: 'CATEGORY', categoryId: randomUUID() }).valid,
    ).toBe(true);
    expect(validateCampaignCta({ kind: 'BRAND', brandId: randomUUID() }).valid).toBe(
      true,
    );
    expect(validateCampaignCta({ kind: 'EXTERNAL', url: 'https://example.com' }).valid).toBe(
      false,
    );
  });

  it('bounds selection counts and rejects duplicate IDs', () => {
    const id = randomUUID();
    expect(
      validateCampaignSelectionLimits({ brandIds: [id, id] }).errors,
    ).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_ID' }));
    expect(
      validateCampaignSelectionLimits({
        categoryIds: Array.from({ length: 7 }, () => randomUUID()),
      }).errors,
    ).toContainEqual(expect.objectContaining({ code: 'SELECTION_LIMIT' }));
    expect(
      validateCampaignSelectionLimits({
        media: Array.from({ length: 5 }, () => ({
          mediaId: randomUUID(),
          slot: 'BANNER',
        })),
      }).errors,
    ).toContainEqual(expect.objectContaining({ code: 'MEDIA_LIMIT' }));
  });

  it('recognizes only the four bounded media slots', () => {
    for (const slot of ['HERO_DESKTOP', 'HERO_MOBILE', 'BANNER', 'EDITORIAL']) {
      expect(isMerchMediaSlot(slot)).toBe(true);
    }
    expect(isMerchMediaSlot('SIDEBAR')).toBe(false);
    expect(isMerchMediaSlot(null)).toBe(false);
  });
});
