import type { NextConfig } from 'next';

// Product media (watermarked assets and thumbnails) is served by the API on
// the configured base URL, so next/image needs that host allow-listed. The
// base URL is the same one the browser uses (NEXT_PUBLIC_API_BASE_URL).
const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';
const apiUrl = new URL(apiBaseUrl);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: apiUrl.protocol.replace(':', '') as 'http' | 'https',
        hostname: apiUrl.hostname,
        ...(apiUrl.port ? { port: apiUrl.port } : {}),
      },
    ],
  },
};

export default nextConfig;
