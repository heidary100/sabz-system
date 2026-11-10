import { Prisma } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'prisma',
  'migrations',
  '20261109010000_merchandising_foundation',
);

function migrationSql(): string {
  return readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');
}

function model(name: string) {
  return Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === name);
}

function enumValues(name: string): string[] {
  return (
    Prisma.dmmf.datamodel.enums
      .find((candidate) => candidate.name === name)
      ?.values.map((value) => value.name) ?? []
  );
}

describe('merchandising schema foundation', () => {
  it('defines the bounded campaign/media/publication enums', () => {
    expect(enumValues('MerchCampaignType')).toEqual([
      'SEASONAL',
      'DISCOUNT',
      'BRAND',
      'CATEGORY',
      'NEW_ARRIVAL',
      'CLEARANCE',
      'EDITORIAL',
    ]);
    expect(enumValues('MerchCtaKind')).toEqual([
      'NONE',
      'ALL_PRODUCTS',
      'PRODUCT',
      'CATEGORY',
      'BRAND',
      'NEW_ARRIVALS',
    ]);
    expect(enumValues('MerchMediaSlot')).toEqual([
      'HERO_DESKTOP',
      'HERO_MOBILE',
      'BANNER',
      'EDITORIAL',
    ]);
    expect(enumValues('HomepagePublicationStatus')).toEqual([
      'SCHEDULED',
      'PUBLISHED',
      'SUPERSEDED',
      'CANCELLED',
    ]);
  });

  it('defines all merchandising models and their ordered joins', () => {
    for (const name of [
      'MerchCampaign',
      'MerchCampaignProduct',
      'MerchCampaignCategory',
      'MerchCampaignBrand',
      'MerchMedia',
      'MerchCampaignMedia',
      'HomepageDraft',
      'HomepagePublication',
    ]) {
      expect(model(name)).toBeDefined();
    }

    const productJoin = model('MerchCampaignProduct');
    expect(productJoin?.fields.find((field) => field.name === 'sortOrder')).toBeDefined();
    expect(productJoin?.uniqueFields).toContainEqual([
      'campaignId',
      'productId',
    ]);

    const mediaJoin = model('MerchCampaignMedia');
    expect(mediaJoin?.fields.find((field) => field.name === 'focalX')).toBeDefined();
    expect(mediaJoin?.fields.find((field) => field.name === 'focalY')).toBeDefined();
    expect(mediaJoin?.fields.find((field) => field.name === 'slot')).toBeDefined();
  });

  it('keeps homepage draft and publication as separate concepts', () => {
    const draft = model('HomepageDraft');
    const publication = model('HomepagePublication');
    expect(draft?.fields.find((field) => field.name === 'revision')).toBeDefined();
    expect(draft?.fields.find((field) => field.name === 'sections')).toBeDefined();
    expect(publication?.fields.find((field) => field.name === 'version')?.isUnique).toBe(true);
    expect(publication?.fields.find((field) => field.name === 'schemaVersion')).toBeDefined();
    expect(publication?.fields.find((field) => field.name === 'sections')).toBeDefined();
  });

  it('documents the raw database invariants in the migration', () => {
    const sql = migrationSql();
    expect(sql).toContain('HomepageDraft_singleton_check');
    expect(sql).toContain('HomepagePublication_one_published_idx');
    expect(sql).toContain('HomepagePublication_status_metadata_check');
    expect(sql).toContain('MerchCampaign_cta_target_check');
    expect(sql).toContain('MerchCampaign_window_check');
    expect(sql).toContain('MerchCampaignMedia_focal_check');
  });
});
