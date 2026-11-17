import { buildDemoSeedPlan } from './planner';
import {
  approvedManifest,
  baseline,
  blogRow,
  campaignRow,
  candidates,
  manifestWithPending,
  mediaRow,
  options,
  pendingManifest,
  planInput,
  product,
  uuid,
} from './test-fixtures';

function codes(plan: ReturnType<typeof buildDemoSeedPlan>): string[] {
  return plan.blockers.map((blocker) => blocker.code);
}

describe('homepage demo seed planner', () => {
  it('blocks the pending approval manifest before any apply', () => {
    const plan = buildDemoSeedPlan(
      planInput(pendingManifest(), { assets: {} }),
    );
    expect(plan.applyPermitted).toBe(false);
    expect(codes(plan)).toEqual(
      expect.arrayContaining(['APPROVAL_PENDING', 'MEDIA_ASSET_MISSING']),
    );
    expect(plan.sections.map((section) => section.type)).toHaveLength(9);
  });

  it('blocks placeholder content even when every approval is true', () => {
    const manifest = approvedManifest();
    manifest.campaigns[0]!.copy.titleFa = 'PENDING APPROVAL — campaign';
    const plan = buildDemoSeedPlan(planInput(manifest));
    expect(codes(plan)).toContain('CONTENT_INCOMPLETE');
    expect(plan.applyPermitted).toBe(false);
  });

  it('produces an apply-ready plan when approvals and guards are complete', () => {
    const plan = buildDemoSeedPlan(planInput());
    expect(plan.blockers).toEqual([]);
    expect(plan.applyPermitted).toBe(true);
    expect(plan.campaigns.every((campaign) => campaign.action === 'create')).toBe(
      true,
    );
    expect(plan.blog.every((article) => article.action === 'create')).toBe(true);
    expect(plan.media.every((asset) => asset.action === 'create')).toBe(true);
    expect(plan.draft).toMatchObject({
      action: 'replace',
      sourceRevision: 3,
      requiresBackup: true,
    });
    expect(plan.publication).toMatchObject({
      action: 'publish',
      supersedes: [3],
      requiresAck: true,
    });
    expect(plan.retained.ss245Post?.slug).toContain('ss-245');
    expect(plan.notes.join(' ')).toContain('SS-245');
  });

  it('resolves explicit product selections by slug in manifest order', () => {
    const manifest = approvedManifest();
    const hero = manifest.campaigns.find(
      (campaign) => campaign.key === 'hero-primary',
    );
    if (!hero) throw new Error('fixture is missing hero-primary');
    hero.selection.products = {
      kind: 'explicit',
      slugs: ['product-2', 'product-1'],
    };
    const plan = buildDemoSeedPlan(planInput(manifest));
    expect(plan.blockers).toEqual([]);
    expect(
      plan.campaigns.find((campaign) => campaign.key === 'hero-primary')?.payload
        .productIds,
    ).toEqual([uuid(1002), uuid(1001)]);
  });

  it('blocks an explicit product selection that is not available', () => {
    const manifest = approvedManifest();
    const hero = manifest.campaigns.find(
      (campaign) => campaign.key === 'hero-primary',
    );
    if (!hero) throw new Error('fixture is missing hero-primary');
    hero.selection.products = {
      kind: 'explicit',
      slugs: ['missing-product'],
    };
    const plan = buildDemoSeedPlan(planInput(manifest));
    expect(plan.applyPermitted).toBe(false);
    expect(codes(plan)).toContain('EXPLICIT_PRODUCT_UNAVAILABLE');
  });

  it('blocks an explicit product selection that is out of stock', () => {
    const manifest = approvedManifest();
    const hero = manifest.campaigns.find(
      (campaign) => campaign.key === 'hero-primary',
    );
    if (!hero) throw new Error('fixture is missing hero-primary');
    hero.selection.products = { kind: 'explicit', slugs: ['product-1'] };
    const input = planInput(manifest);
    const selected = input.candidates.productsBySlug?.['product-1'];
    if (!selected) throw new Error('fixture is missing product-1');
    selected.inStock = false;
    const plan = buildDemoSeedPlan(input);
    expect(plan.applyPermitted).toBe(false);
    expect(codes(plan)).toContain('EXPLICIT_PRODUCT_UNAVAILABLE');
  });

  it('requires --replace-draft for an existing draft', () => {
    const plan = buildDemoSeedPlan(
      planInput(approvedManifest(), {
        options: options({ replaceDraft: false }),
      }),
    );
    expect(codes(plan)).toContain('DRAFT_REPLACEMENT_FLAG_MISSING');
    expect(plan.applyPermitted).toBe(false);
  });

  it('requires confirmation and the expected fingerprint', () => {
    const plan = buildDemoSeedPlan(
      planInput(approvedManifest(), {
        options: options({
          confirm: false,
          expectedFingerprint: '0'.repeat(64),
        }),
      }),
    );
    expect(codes(plan)).toEqual(
      expect.arrayContaining([
        'CONFIRMATION_MISSING',
        'FINGERPRINT_MISMATCH',
      ]),
    );
  });

  it('blocks missing media assets when creation is required', () => {
    const input = planInput();
    input.assets[input.manifest.media[0]!.key] = {
      path: '/tmp/missing.jpg',
      exists: false,
      sizeBytes: null,
      sha256: null,
      error: null,
    };
    const plan = buildDemoSeedPlan(input);
    expect(codes(plan)).toContain('MEDIA_ASSET_MISSING');
    expect(plan.media.find((asset) => asset.key === input.manifest.media[0]!.key)?.action).toBe(
      'blocked',
    );
  });

  it('blocks owned media reuse when the approved source file is missing', () => {
    const manifest = approvedManifest();
    const input = planInput(manifest, {
      media: manifest.media.map((asset) => mediaRow(manifest, asset.key)),
      assets: Object.fromEntries(
        manifest.media.map((asset) => [
          asset.key,
          {
            path: '/tmp/not-needed.jpg',
            exists: false,
            sizeBytes: null,
            sha256: null,
            error: null,
          },
        ]),
      ),
    });
    const plan = buildDemoSeedPlan(input);
    expect(codes(plan)).toContain('MEDIA_ASSET_MISSING');
    expect(plan.media.every((asset) => asset.action === 'blocked')).toBe(true);
  });

  it('blocks owned media reuse when provenance does not match the approved asset', () => {
    const manifest = approvedManifest();
    const input = planInput(manifest, {
      media: manifest.media.map((asset) =>
        mediaRow(manifest, asset.key, {
          sourceSha256: 'b'.repeat(64),
        }),
      ),
    });
    const plan = buildDemoSeedPlan(input);
    expect(codes(plan)).toContain('MEDIA_PROVENANCE_MISMATCH');
    expect(plan.media.every((asset) => asset.action === 'blocked')).toBe(true);
  });

  it('blocks per-article publish=false in a publishing operation', () => {
    const manifest = approvedManifest();
    manifest.blog[0]!.publish = false;
    const input = planInput(manifest);
    const plan = buildDemoSeedPlan(input);
    expect(codes(plan)).toContain('BLOG_ARTICLE_PUBLISH_REQUIRED');
  });

  it('blocks ambiguous and manually edited campaign ownership', () => {
    const manifest = approvedManifest();
    const campaign = manifest.campaigns[0]!;
    const ambiguous = buildDemoSeedPlan(
      planInput(manifest, {
        campaigns: [
          campaignRow(campaign.internalName, { createdBy: 'someone-else' }),
        ],
      }),
    );
    expect(codes(ambiguous)).toContain('OWNERSHIP_AMBIGUOUS');

    const manual = buildDemoSeedPlan(
      planInput(manifest, {
        campaigns: [
          campaignRow(campaign.internalName, { updatedBy: 'operator' }),
        ],
      }),
    );
    expect(codes(manual)).toContain('OWNERSHIP_MANUALLY_EDITED');
  });

  it('blocks duplicate campaign and media ownership markers', () => {
    const manifest = approvedManifest();
    const campaign = manifest.campaigns[0]!;
    const duplicateCampaign = campaignRow(campaign.internalName);
    const media = manifest.media[0]!;
    const mediaRowValue = mediaRow(manifest, media.key);
    const plan = buildDemoSeedPlan(
      planInput(manifest, {
        campaigns: [duplicateCampaign, duplicateCampaign],
        media: [mediaRowValue, mediaRowValue],
      }),
    );
    expect(codes(plan)).toContain('OWNERSHIP_AMBIGUOUS');
  });

  it('reuses owned records instead of creating duplicates on a second run', () => {
    const manifest = approvedManifest();
    const plan = buildDemoSeedPlan(
      planInput(manifest, {
        campaigns: manifest.campaigns.map((campaign) =>
          campaignRow(campaign.internalName),
        ),
        blogPosts: manifest.blog.map((article) => blogRow(article.slug)),
        media: manifest.media.map((asset) => mediaRow(manifest, asset.key)),
      }),
    );
    expect(plan.campaigns.every((campaign) => campaign.action === 'update')).toBe(
      true,
    );
    expect(plan.blog.every((article) => article.action === 'update')).toBe(true);
    expect(plan.media.every((asset) => asset.action === 'reuse')).toBe(true);
  });

  it('blocks manually edited blog posts and ambiguous media', () => {
    const manifest = approvedManifest();
    const manualBlog = buildDemoSeedPlan(
      planInput(manifest, {
        blogPosts: [
          blogRow(manifest.blog[0]!.slug, { updatedBy: 'operator' }),
        ],
      }),
    );
    expect(codes(manualBlog)).toContain('OWNERSHIP_MANUALLY_EDITED');

    const ambiguousMedia = buildDemoSeedPlan(
      planInput(manifest, {
        media: [
          mediaRow(manifest, manifest.media[0]!.key, {
            createdBy: 'someone-else',
          }),
        ],
      }),
    );
    expect(codes(ambiguousMedia)).toContain('OWNERSHIP_AMBIGUOUS');
  });

  it('requires exact media reconciliation approval and acknowledgement', () => {
    const media = [
      {
        id: uuid(8801),
        originalName: 'operator-media.jpg',
        createdBy: 'operator',
        publishedAt: '2026-11-10T00:00:00.000Z',
        deletedAt: null,
      },
      {
        id: uuid(8802),
        originalName: 'deleted-media.jpg',
        createdBy: 'operator',
        publishedAt: '2026-11-10T00:00:00.000Z',
        deletedAt: '2026-11-11T00:00:00.000Z',
      },
    ];
    const manifest = manifestWithPending(['media_reconciliation']);
    const plan = buildDemoSeedPlan(
      planInput(manifest, {
        publishedMedia: media,
        baseline: {
          ...baseline(),
          counts: { ...baseline().counts, publishedMerchMedia: 2 },
        },
      }),
    );
    expect(codes(plan)).toContain('MEDIA_RECONCILIATION_NOT_ACKNOWLEDGED');
    expect(plan.mediaReconciliation.affected.map((row) => row.id)).toEqual(
      media.map((row) => row.id),
    );

    const approved = buildDemoSeedPlan(
      planInput(approvedManifest(), {
        publishedMedia: media,
        options: options({
          mediaReconciliationAckIds: media.map((row) => row.id),
        }),
        baseline: {
          ...baseline(),
          counts: { ...baseline().counts, publishedMerchMedia: 2 },
        },
      }),
    );
    expect(codes(approved)).not.toContain(
      'MEDIA_RECONCILIATION_NOT_ACKNOWLEDGED',
    );
    expect(codes(approved)).not.toContain(
      'MEDIA_RECONCILIATION_SET_MISMATCH',
    );
  });

  it('blocks published blog covers without a homepage publication', () => {
    const plan = buildDemoSeedPlan(
      planInput(approvedManifest(), {
        options: options({ publish: false }),
      }),
    );
    expect(codes(plan)).toContain('BLOG_ACTIVATION_REQUIRES_PUBLICATION');
  });

  it('requires explicit approval for CALL_FOR_PRICE READY_TO_SHIP candidates', () => {
    const products = candidates().products;
    products[0] = product(99, { callForPrice: true });
    const plan = buildDemoSeedPlan(
      planInput(manifestWithPending(['call_for_price_ready_to_ship']), {
        candidates: { ...candidates(), products },
      }),
    );
    expect(codes(plan)).toContain('CALL_FOR_PRICE_NOT_APPROVED');
  });

  it('warns and does not recreate a missing SS-245 post', () => {
    const plan = buildDemoSeedPlan(
      planInput(approvedManifest(), { ss245Post: null }),
    );
    expect(plan.retained.ss245Post).toBeNull();
    expect(plan.warnings.map((warning) => warning.code)).toContain(
      'SS245_POST_CHANGED',
    );
  });

  it('rejects a private or localhost public API base', () => {
    const plan = buildDemoSeedPlan(
      planInput(approvedManifest(), {
        options: options({
          publicApiBaseUrl: 'http://localhost:3000/api/v1',
        }),
      }),
    );
    expect(codes(plan)).toContain('PUBLIC_API_BASE_INVALID');
  });

  it('includes the spotlight category in the spotlight campaign payload', () => {
    const manifest = approvedManifest();
    const spotlight = manifest.campaigns.find(
      (campaign) => campaign.key === 'spotlight',
    );
    if (!spotlight) throw new Error('fixture is missing the spotlight campaign');
    const plan = buildDemoSeedPlan(planInput(manifest));
    const spotlightPlan = plan.campaigns.find(
      (campaign) => campaign.key === 'spotlight',
    );
    expect(spotlightPlan?.payload.categoryIds).toEqual([
      plan.candidates.categories[0]!.id,
    ]);
    expect(plan.sections.find((section) => section.key === 'homepage-spotlight'))
      .toMatchObject({ campaignKeys: ['spotlight'] });
  });

  it('surfaces the selected candidates and nine section previews', () => {
    const plan = buildDemoSeedPlan(planInput());
    expect(plan.candidates.products[0]?.id).toBe(uuid(1001));
    expect(plan.sections.map((section) => section.type)).toEqual([
      'HERO_CAROUSEL',
      'TRUST_STRIP',
      'CATEGORY_DISCOVERY',
      'OFFER_STRIP',
      'CATEGORY_SPOTLIGHT',
      'READY_TO_SHIP',
      'PRODUCT_RAIL',
      'BRAND_SHOWCASE',
      'BLOG_FEATURE',
    ]);
  });
});
