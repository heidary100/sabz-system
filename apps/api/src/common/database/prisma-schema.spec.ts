import { Prisma } from '@prisma/client';

describe('Prisma schema numeric precision (SS-031)', () => {
  const partnerTier = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === 'PartnerTier',
  );

  it('constrains discountPercent to NUMERIC(5,2) so percentages stay meaningful', () => {
    const field = partnerTier?.fields.find(
      (candidate) => candidate.name === 'discountPercent',
    );

    expect(field).toBeDefined();
    // NUMERIC(5,2) accepts 0.00-999.99: representative values such as 0,
    // 12.5 and 100.00 fit; values beyond the precision are rejected.
    expect(field!.type).toBe('Decimal');
    expect(field!.nativeType).toEqual(['Decimal', ['5', '2']]);
  });

  it('keeps minOrderQuantity as Int, which is sufficient for order quantities', () => {
    const field = partnerTier?.fields.find(
      (candidate) => candidate.name === 'minOrderQuantity',
    );

    expect(field).toBeDefined();
    expect(field!.type).toBe('Int');
    expect(field!.nativeType).toBeNull();
  });
});
