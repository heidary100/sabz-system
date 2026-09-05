import { join } from 'path';

/**
 * Product media temporary upload directory (SS-105 media pipeline).
 *
 * Uploads land on disk (multer disk storage) before validation and watermark
 * processing so a 200 MB video is never buffered in a Node.js memory heap.
 * The default is a `tmp` sub-directory of the media storage root so temp
 * files stay inside the same mounted volume in Docker.
 *
 * The value read here mirrors the `PRODUCT_MEDIA_TEMP_DIR` config fallback
 * used by the products module provider, so the multer interceptor (evaluated
 * at decoration time from the process environment) and the services (resolved
 * through ConfigService at bootstrap) converge on the same directory by
 * default. In Docker the variable is passed explicitly through compose.
 */
export function resolveProductMediaTempDir(): string {
  const env = process.env.PRODUCT_MEDIA_TEMP_DIR;
  if (env && env.trim() !== '') {
    return env;
  }
  const storageDir = process.env.PRODUCT_MEDIA_STORAGE_DIR ?? '.data/product-media';
  return join(storageDir, 'tmp');
}