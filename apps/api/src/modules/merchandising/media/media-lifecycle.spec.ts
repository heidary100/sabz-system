import { collectMediaIds, collectVisibleMediaIds } from './media-lifecycle';

function section(key: string, isVisible: boolean, mediaIds: string[]): Record<string, unknown> {
  return {
    key,
    type: 'HERO_CAROUSEL',
    order: 0,
    isVisible,
    settings: {
      campaigns: [
        {
          sourceCampaignId: 'campaign-1',
          media: mediaIds.map((mediaId, index) => ({
            mediaId,
            slot: index === 0 ? 'HERO_DESKTOP' : 'BANNER',
            sortOrder: index,
          })),
        },
      ],
    },
  };
}

describe('collectVisibleMediaIds', () => {
  it('includes visible-only and shared media but excludes hidden-only media', () => {
    const snapshot = {
      schemaVersion: 1,
      sections: [
        section('visible', true, ['visible-only', 'shared']),
        section('hidden', false, ['hidden-only', 'shared']),
      ],
    };

    expect([...collectVisibleMediaIds(snapshot)].sort()).toEqual(['shared', 'visible-only']);
    expect([...collectMediaIds(snapshot)].sort()).toEqual([
      'hidden-only',
      'shared',
      'visible-only',
    ]);
  });

  it('returns an empty set for missing or malformed snapshots', () => {
    expect([...collectVisibleMediaIds(null)]).toEqual([]);
    expect([...collectVisibleMediaIds({})]).toEqual([]);
    expect([...collectVisibleMediaIds({ sections: 'nope' })]).toEqual([]);
  });

  it('handles an array-shaped snapshot by selecting visible sections', () => {
    expect([
      ...collectVisibleMediaIds([
        section('visible', true, ['visible']),
        section('hidden', false, ['hidden']),
      ]),
    ]).toEqual(['visible']);
  });
});
