import type { NextConfig } from 'next';
import {
  getImageRemotePatterns,
  resolveApiConfig,
} from './src/lib/api-url';

// Product media (watermarked assets and thumbnails) is served by the API.
// next/image fetches absolute upstreams server-side. A same-origin relative
// media base needs no remote pattern; only explicit absolute origins are
// allow-listed. Configuration is validated here so a missing/invalid
// production base fails the build instead of falling back to localhost.
const config = resolveApiConfig(process.env);
const remotePatterns = getImageRemotePatterns(config);

const nextConfig: NextConfig = {
  // Optional isolated build/dev directory (useful for parallel UI verification).
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  images: {
    remotePatterns,
    // The optimizer fetches media from the trusted internal API over the
    // Compose network (a private IP by design); upstream URLs are always
    // server-generated media IDs, never user input.
    dangerouslyAllowLocalIP: true,
  },
};

export default nextConfig;
