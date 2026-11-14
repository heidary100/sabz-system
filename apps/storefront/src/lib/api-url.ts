/**
 * Storefront API/media origin resolution.
 *
 * Browser-facing values may be absolute HTTP(S) URLs or root-relative
 * same-origin paths (e.g. `/api/v1` behind a storefront proxy). Server-side
 * fetches and the Next image optimizer need an absolute HTTP(S) base; the
 * internal URL is therefore resolved separately.
 */

export const DEV_API_FALLBACK = 'http://localhost:3000/api/v1';

export interface ApiUrlEnvironment {
  NODE_ENV?: string;
  NEXT_PUBLIC_API_BASE_URL?: string;
  NEXT_PUBLIC_MEDIA_BASE_URL?: string;
  API_INTERNAL_BASE_URL?: string;
}

export interface ResolvedApiConfig {
  browserBaseUrl: string;
  internalBaseUrl: string;
  mediaBaseUrl: string;
}

export interface ImageRemotePattern {
  protocol: 'http' | 'https';
  hostname: string;
  port?: string;
}

function trimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const result = value.trim();
  return result === '' ? undefined : result;
}

export function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isRootRelativePath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//');
}

function withoutTrailingSlash(value: string): string {
  if (value === '/') return value;
  return value.replace(/\/+$/, '');
}

function normalizeBase(
  name: string,
  value: string | undefined,
  options: { allowRelative: boolean; fallback?: string },
): string {
  const raw = trimmed(value);
  if (raw === undefined) {
    if (options.fallback !== undefined) return options.fallback;
    throw new Error(
      `${name} is required. Use an absolute http(s) URL${options.allowRelative ? ' or a root-relative path such as /api/v1' : ''}.`,
    );
  }
  if (isAbsoluteHttpUrl(raw)) {
    return withoutTrailingSlash(raw);
  }
  if (options.allowRelative && isRootRelativePath(raw)) {
    return withoutTrailingSlash(raw);
  }
  throw new Error(
    `${name} must be an absolute http(s) URL${options.allowRelative ? ' or a root-relative path such as /api/v1' : ''}; received "${raw}".`,
  );
}

export function resolveBrowserApiBaseUrl(
  value: string | undefined,
  production: boolean,
): string {
  return normalizeBase('NEXT_PUBLIC_API_BASE_URL', value, {
    allowRelative: true,
    fallback: production ? undefined : DEV_API_FALLBACK,
  });
}

/**
 * Server-side API base. It is never allowed to be root-relative because Node
 * fetch has no ambient origin. When the internal value is omitted, an
 * absolute browser base can be reused; a same-origin browser base requires an
 * explicit internal origin.
 */
export function resolveInternalApiBaseUrl(
  value: string | undefined,
  browserBaseUrl: string,
): string {
  const raw = trimmed(value);
  if (raw !== undefined) {
    return normalizeBase('API_INTERNAL_BASE_URL', raw, {
      allowRelative: false,
    });
  }
  if (isAbsoluteHttpUrl(browserBaseUrl)) {
    return browserBaseUrl;
  }
  throw new Error(
    'API_INTERNAL_BASE_URL is required and must be an absolute http(s) URL when NEXT_PUBLIC_API_BASE_URL is root-relative.',
  );
}

export function resolveMediaBaseUrl(
  value: string | undefined,
  browserBaseUrl: string,
): string {
  return normalizeBase('NEXT_PUBLIC_MEDIA_BASE_URL', value, {
    allowRelative: true,
    fallback: browserBaseUrl,
  });
}

export function resolveApiConfig(
  env: ApiUrlEnvironment,
  options: { production?: boolean } = {},
): ResolvedApiConfig {
  const production = options.production ?? env.NODE_ENV === 'production';
  const browserBaseUrl = resolveBrowserApiBaseUrl(
    env.NEXT_PUBLIC_API_BASE_URL,
    production,
  );
  const internalBaseUrl = resolveInternalApiBaseUrl(
    env.API_INTERNAL_BASE_URL,
    browserBaseUrl,
  );
  const mediaBaseUrl = resolveMediaBaseUrl(
    env.NEXT_PUBLIC_MEDIA_BASE_URL,
    browserBaseUrl,
  );
  return { browserBaseUrl, internalBaseUrl, mediaBaseUrl };
}

function normalizeMediaPath(path: string | null | undefined): string | null {
  if (typeof path !== 'string') return null;
  const raw = path.trim();
  if (raw === '') return null;
  if (isAbsoluteHttpUrl(raw)) return raw;
  if (isRootRelativePath(raw)) return raw;
  return null;
}

/** Browser-facing media URL; root-relative output is valid same-origin HTML. */
export function resolveBrowserMediaUrl(
  path: string | null | undefined,
  baseUrl: string,
): string | null {
  const normalized = normalizeMediaPath(path);
  if (normalized === null) return null;
  if (isAbsoluteHttpUrl(normalized)) return normalized;
  if (isAbsoluteHttpUrl(baseUrl)) {
    return new URL(normalized, baseUrl).toString();
  }
  if (isRootRelativePath(baseUrl)) return normalized;
  return null;
}

/** next/image source URL; root-relative output is handled by Next same-origin. */
export function resolveOptimizerMediaUrl(
  path: string | null | undefined,
  baseUrl: string,
): string | null {
  const normalized = normalizeMediaPath(path);
  if (normalized === null) return null;
  if (isAbsoluteHttpUrl(normalized)) return normalized;
  if (isAbsoluteHttpUrl(baseUrl)) {
    return new URL(normalized, baseUrl).toString();
  }
  if (isRootRelativePath(baseUrl)) return normalized;
  return null;
}

/** Absolute origins are allow-listed for the Next image optimizer. */
export function getImageRemotePatterns(
  config: Pick<ResolvedApiConfig, 'browserBaseUrl' | 'mediaBaseUrl'>,
): ImageRemotePattern[] {
  const bases = [config.browserBaseUrl, config.mediaBaseUrl];
  const patterns: ImageRemotePattern[] = [];
  const seen = new Set<string>();
  for (const base of bases) {
    if (!isAbsoluteHttpUrl(base)) continue;
    const url = new URL(base);
    const key = `${url.protocol}|${url.hostname}|${url.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    patterns.push({
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
    });
  }
  return patterns;
}
