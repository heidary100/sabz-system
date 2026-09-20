import type { NextConfig } from 'next';

// Product media (watermarked assets and thumbnails) is served by the API.
// next/image fetches upstreams server-side, so inside Docker the upstream
// must be the compose-internal hostname (NEXT_PUBLIC_MEDIA_BASE_URL); the
// browser-facing host is kept for host-native development. Both are
// allow-listed; the optimizer only ever fetches the configured media base.
function toPattern(baseUrl: string) {
  const url = new URL(baseUrl);
  return {
    protocol: url.protocol.replace(':', '') as 'http' | 'https',
    hostname: url.hostname,
    ...(url.port ? { port: url.port } : {}),
  };
}

const browserBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';
const mediaBaseUrl =
  process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? browserBaseUrl;

const patterns = [browserBaseUrl, mediaBaseUrl].map(toPattern);
const remotePatterns = patterns.filter(
  (pattern, index) =>
    patterns.findIndex(
      (other) =>
        other.hostname === pattern.hostname && other.port === pattern.port,
    ) === index,
);

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
    // The optimizer fetches media from the trusted internal API over the
    // Compose network (a private IP by design); upstream URLs are always
    // server-generated media IDs, never user input.
    dangerouslyAllowLocalIP: true,
  },
};

export default nextConfig;
