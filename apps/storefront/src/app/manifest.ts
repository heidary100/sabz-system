import type { MetadataRoute } from 'next';

/**
 * Storefront PWA manifest (SS-900 Part II). Next.js emits the
 * `<link rel="manifest">` automatically; the icons are static brand assets.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'سبز سیستم — فروشگاه کالای دیجیتال',
    short_name: 'سبز سیستم',
    description: 'فروشگاه اینترنتی کالای دیجیتال و لوازم جانبی سبز سیستم',
    lang: 'fa',
    dir: 'rtl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#F4F6F5',
    theme_color: '#16A54B',
    categories: ['shopping', 'electronics'],
    prefer_related_applications: false,
    icons: [
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
