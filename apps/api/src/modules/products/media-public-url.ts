/**
 * Public media URL construction with an immutable-cache version token.
 *
 * Media rows keep the same UUID while a reimport/reprocess may replace the
 * stored bytes under a new storage key. Public responses are cached as
 * immutable for a year, so the URL must change with the bytes: the storage
 * filename (a UUID) is a stable, cheap version token. Next's image optimizer
 * and browsers then fetch the replacement instead of serving the old asset.
 */
export const PUBLIC_MEDIA_URL_PREFIX = '/api/v1/catalog/media';

function versionToken(storageKey: string | null | undefined): string | null {
  if (!storageKey) {
    return null;
  }
  const name = storageKey.split('/').pop()?.trim();
  return name && name.length > 0 ? name : null;
}

export function publicMediaAssetUrl(
  mediaId: string,
  storageKey: string | null | undefined,
  thumbnail = false,
  thumbnailKey: string | null | undefined = null,
): string {
  const key = thumbnail ? thumbnailKey ?? storageKey : storageKey;
  const version = versionToken(key);
  const path = `${PUBLIC_MEDIA_URL_PREFIX}/${mediaId}${thumbnail ? '/thumbnail' : ''}`;
  return version === null ? path : `${path}?v=${encodeURIComponent(version)}`;
}
