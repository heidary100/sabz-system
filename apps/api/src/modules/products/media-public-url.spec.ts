import { publicMediaAssetUrl } from './media-public-url';

describe('publicMediaAssetUrl', () => {
  it('changes when the stored derivative changes', () => {
    const first = publicMediaAssetUrl('media-1', 'products/p/media-1/old.png');
    const second = publicMediaAssetUrl('media-1', 'products/p/media-1/new.png');
    expect(first).toBe('/api/v1/catalog/media/media-1?v=old.png');
    expect(second).toBe('/api/v1/catalog/media/media-1?v=new.png');
    expect(first).not.toBe(second);
  });

  it('versions thumbnails by their own key', () => {
    expect(
      publicMediaAssetUrl(
        'media-1',
        'products/p/media-1/new.png',
        true,
        'products/p/media-1/new.thumb.webp',
      ),
    ).toBe('/api/v1/catalog/media/media-1/thumbnail?v=new.thumb.webp');
  });

  it('stays stable when the key is missing', () => {
    expect(publicMediaAssetUrl('media-1', null)).toBe(
      '/api/v1/catalog/media/media-1',
    );
  });
});
