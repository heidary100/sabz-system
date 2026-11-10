import { randomUUID } from 'crypto';
import { validateCampaignInput } from './campaign-input';

function validCreate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    internalName: 'کمپین پاییزه',
    type: 'SEASONAL',
    titleFa: 'پاییزه‌های سبز',
    ...overrides,
  };
}

describe('campaign input validation', () => {
  it('accepts a minimal valid create payload', () => {
    const result = validateCampaignInput(validCreate(), 'create');
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('accepts a fully populated create payload', () => {
    const result = validateCampaignInput(
      validCreate({
        eyebrowFa: 'ویژه',
        subtitleFa: 'زیرعنوان',
        descriptionFa: 'توضیح',
        ctaLabelFa: 'مشاهده',
        cta: { kind: 'PRODUCT', productId: randomUUID() },
        isEnabled: false,
        startsAt: '2026-11-10T00:00:00.000Z',
        endsAt: '2026-11-20T00:00:00.000Z',
        priority: 10,
        productIds: [randomUUID()],
        categoryIds: [randomUUID()],
        brandIds: [randomUUID()],
        media: [
          {
            mediaId: randomUUID(),
            slot: 'HERO_DESKTOP',
            focalX: 25,
            focalY: 75,
            altFa: 'تصویر',
          },
        ],
      }),
      'create',
    );
    expect(result.valid).toBe(true);
  });

  it('rejects unknown campaign fields instead of dropping them', () => {
    const result = validateCampaignInput(
      validCreate({ publishedAt: '2026-11-10T00:00:00.000Z' }),
      'create',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'campaign.publishedAt', code: 'UNKNOWN_FIELD' }),
    );
  });

  it('requires internal name, type, and Persian title on create', () => {
    const result = validateCampaignInput({}, 'create');
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(['campaign.internalName', 'campaign.type', 'campaign.titleFa']),
    );
  });

  it('rejects an unknown campaign type', () => {
    const result = validateCampaignInput(validCreate({ type: 'FLASH_SALE' }), 'create');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'campaign.type', code: 'INVALID_CAMPAIGN_TYPE' }),
    );
  });

  it('rejects malformed CTA targets and extra target identifiers', () => {
    const malformed = validateCampaignInput(
      validCreate({ cta: { kind: 'PRODUCT' } }),
      'create',
    );
    expect(malformed.valid).toBe(false);
    expect(malformed.errors).toContainEqual(
      expect.objectContaining({ path: 'campaign.cta.productId', code: 'INVALID_UUID' }),
    );

    const extraTarget = validateCampaignInput(
      validCreate({ cta: { kind: 'NONE', productId: randomUUID() } }),
      'create',
    );
    expect(extraTarget.valid).toBe(false);
    expect(extraTarget.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_CTA_TARGET' }),
    );
  });

  it('rejects duplicate selections and selection limits', () => {
    const id = randomUUID();
    const duplicate = validateCampaignInput(
      validCreate({ productIds: [id, id] }),
      'create',
    );
    expect(duplicate.valid).toBe(false);
    expect(duplicate.errors).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_ID' }),
    );

    const tooMany = validateCampaignInput(
      validCreate({ productIds: Array.from({ length: 13 }, () => randomUUID()) }),
      'create',
    );
    expect(tooMany.valid).toBe(false);
    expect(tooMany.errors).toContainEqual(
      expect.objectContaining({ code: 'SELECTION_LIMIT' }),
    );
  });

  it('rejects invalid media slots, focal points, and duplicate media/slot pairs', () => {
    const mediaId = randomUUID();
    const invalidSlot = validateCampaignInput(
      validCreate({ media: [{ mediaId, slot: 'SIDEBAR' }] }),
      'create',
    );
    expect(invalidSlot.valid).toBe(false);
    expect(invalidSlot.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_MEDIA_SLOT' }),
    );

    const invalidFocal = validateCampaignInput(
      validCreate({ media: [{ mediaId, slot: 'BANNER', focalX: 101 }] }),
      'create',
    );
    expect(invalidFocal.valid).toBe(false);
    expect(invalidFocal.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_INTEGER' }),
    );

    const duplicate = validateCampaignInput(
      validCreate({
        media: [
          { mediaId, slot: 'BANNER' },
          { mediaId, slot: 'BANNER' },
        ],
      }),
      'create',
    );
    expect(duplicate.valid).toBe(false);
    expect(duplicate.errors).toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_MEDIA_SLOT' }),
    );
  });

  it('rejects malformed schedule dates and non-integer priority', () => {
    const result = validateCampaignInput(
      validCreate({ startsAt: 'not-a-date', priority: 1.5 }),
      'create',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'campaign.startsAt', code: 'INVALID_DATE' }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'campaign.priority', code: 'INVALID_INTEGER' }),
    );
  });

  it('rejects an empty update body', () => {
    const result = validateCampaignInput({}, 'update');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'EMPTY_UPDATE' }),
    );
  });

  it('allows null presentation fields on update but not an empty title', () => {
    expect(
      validateCampaignInput({ eyebrowFa: null, subtitleFa: null }, 'update').valid,
    ).toBe(true);
    const emptyTitle = validateCampaignInput({ titleFa: '   ' }, 'update');
    expect(emptyTitle.valid).toBe(false);
    expect(emptyTitle.errors).toContainEqual(
      expect.objectContaining({ path: 'campaign.titleFa' }),
    );
  });
});
