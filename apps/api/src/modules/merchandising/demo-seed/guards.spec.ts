import {
  assertDraftState,
  assertFinalBlogContentUnchanged,
  assertMediaReconciliation,
  assertPublicationAcknowledgement,
  assertPublishedBlogUnchanged,
  assertPublishedState,
} from './guards';

describe('homepage demo seed concurrency guards', () => {
  it('accepts the planned draft revision', () => {
    expect(() =>
      assertDraftState({
        expectedRevision: 3,
        currentRevision: 3,
        currentSectionCount: 3,
        replaceDraft: true,
      }),
    ).not.toThrow();
  });

  it('aborts when the draft revision changed after planning', () => {
    expect(() =>
      assertDraftState({
        expectedRevision: 3,
        currentRevision: 4,
        currentSectionCount: 3,
        replaceDraft: true,
      }),
    ).toThrow(/revision changed/);
  });

  it('aborts when a draft appears after planning', () => {
    expect(() =>
      assertDraftState({
        expectedRevision: null,
        currentRevision: 1,
        currentSectionCount: 3,
        replaceDraft: false,
      }),
    ).toThrow(/appeared after planning/);
  });

  it('requires the explicit replacement flag', () => {
    expect(() =>
      assertDraftState({
        expectedRevision: 3,
        currentRevision: 3,
        currentSectionCount: 3,
        replaceDraft: false,
      }),
    ).toThrow(/not explicitly authorized/);
  });

  it('aborts when publication state changed after planning', () => {
    expect(() => assertPublishedState([3], [3])).not.toThrow();
    expect(() => assertPublishedState([3], [4])).toThrow(
      /Published homepage state changed/,
    );
    expect(() => assertPublishedState([], [3])).toThrow(
      /Published homepage state changed/,
    );
  });

  it('requires the exact affected media set and acknowledgement', () => {
    expect(() =>
      assertMediaReconciliation({
        expectedAffectedIds: ['media-a', 'media-b'],
        actualAffectedIds: ['media-b', 'media-a'],
        acknowledgedIds: ['media-a', 'media-b'],
      }),
    ).not.toThrow();

    expect(() =>
      assertMediaReconciliation({
        expectedAffectedIds: ['media-a'],
        actualAffectedIds: ['media-a', 'media-new'],
        acknowledgedIds: ['media-a'],
      }),
    ).toThrow(/affected set changed/);

    expect(() =>
      assertMediaReconciliation({
        expectedAffectedIds: ['media-a'],
        actualAffectedIds: ['media-a'],
        acknowledgedIds: ['media-b'],
      }),
    ).toThrow(/acknowledgement/);

    expect(() =>
      assertMediaReconciliation({
        expectedAffectedIds: ['media-a'],
        actualAffectedIds: ['media-a'],
        acknowledgedIds: ['media-a', 'media-a'],
      }),
    ).toThrow(/unique/);
  });

  it('refuses to change an already-published demo article before publication', () => {
    const existing = {
      title: 'title',
      excerpt: 'excerpt',
      content: '<p>body</p>',
      coverImageUrl: 'https://shop.example.com/api/v1/catalog/merch-media/a',
      authorName: 'editorial',
      metaTitle: null,
      metaDescription: null,
      categoryId: null,
    };
    expect(() =>
      assertPublishedBlogUnchanged({
        slug: 'homepage-demo-a',
        existing,
        desired: { ...existing },
      }),
    ).not.toThrow();
    expect(() =>
      assertPublishedBlogUnchanged({
        slug: 'homepage-demo-a',
        existing,
        desired: { ...existing, title: 'changed' },
      }),
    ).toThrow(/Refusing to change public content/);
    expect(() =>
      assertPublishedBlogUnchanged({
        slug: 'homepage-demo-a',
        existing,
        desired: { ...existing, coverImageUrl: null },
      }),
    ).toThrow(/Refusing to change public content/);
    expect(() =>
      assertPublishedBlogUnchanged({
        slug: 'homepage-demo-a',
        existing,
        desired: { ...existing, metaTitle: 'changed meta' },
      }),
    ).toThrow(/Refusing to change public content/);
    expect(() =>
      assertPublishedBlogUnchanged({
        slug: 'homepage-demo-a',
        existing,
        desired: { ...existing, categoryId: 'category-b' },
      }),
    ).toThrow(/Refusing to change public content/);
    expect(() =>
      assertFinalBlogContentUnchanged({
        slug: 'homepage-demo-a',
        existing,
        desired: { ...existing },
      }),
    ).not.toThrow();
    expect(() =>
      assertFinalBlogContentUnchanged({
        slug: 'homepage-demo-a',
        existing,
        desired: { ...existing, content: '<p>changed</p>' },
      }),
    ).toThrow(/changed after planning/);
  });

  it('requires acknowledgement when replacing a published homepage', () => {
    expect(() =>
      assertPublicationAcknowledgement({
        publish: true,
        expectedPublishedVersions: [3],
        acknowledged: false,
      }),
    ).toThrow(/not acknowledged/);
    expect(() =>
      assertPublicationAcknowledgement({
        publish: true,
        expectedPublishedVersions: [3],
        acknowledged: true,
      }),
    ).not.toThrow();
  });
});
