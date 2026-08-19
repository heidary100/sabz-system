import { BadRequestException } from '@nestjs/common';
import { ProductMediaType } from '@prisma/client';

/**
 * Product media validation contract (SS-105).
 *
 * The supported formats come from the product-catalog feature spec: images
 * JPG/PNG/WEBP and video MP4. A single 10 MB cap is applied for all media
 * (the requirements define no per-type limits).
 *
 * Validation is layered:
 *   1. MIME declaration  – the declared MIME must be in the allowed set.
 *   2. Magic bytes       – the leading content signature must match the
 *                          declared MIME (a client MIME is never trusted).
 *   3. Deep validation   – intentionally NOT performed in M1. No media parser
 *                          is available, so video is validated only by its
 *                          ISOBMFF `ftyp` container signature, not by codec or
 *                          stream inspection. Unsupported formats are rejected.
 */

export const ALLOWED_MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
] as const;

export type AllowedMediaMimeType = (typeof ALLOWED_MEDIA_MIME_TYPES)[number];

export const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024;

const IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** File extension emitted from a validated MIME type; never from filenames. */
const MIME_TO_EXTENSION: Record<AllowedMediaMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
};

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const RIFF_MAGIC = Buffer.from([0x52, 0x49, 0x46, 0x46]); // RIFF
const WEBP_MAGIC = Buffer.from([0x57, 0x45, 0x42, 0x50]); // WEBP

/**
 * Detects the real media format from magic bytes. The client-declared MIME
 * type is never trusted for storage decisions. Returns the detected MIME or
 * null when the content is not a recognized format.
 */
export function detectMediaMimeFromMagic(
  buffer: Buffer,
): AllowedMediaMimeType | null {
  if (
    buffer.length >= JPEG_MAGIC.length &&
    buffer.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)
  ) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= PNG_MAGIC.length &&
    buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(RIFF_MAGIC) &&
    buffer.subarray(8, 12).equals(WEBP_MAGIC)
  ) {
    return 'image/webp';
  }
  // MP4 (ISOBMFF): the first box is a 4-byte size + a 4-byte type; an MP4 file
  // has a `ftyp` box type at offset 4. This is a shallow container signature,
  // not codec validation (M1 boundary).
  if (
    buffer.length >= 8 &&
    buffer.subarray(4, 8).equals(Buffer.from([0x66, 0x74, 0x79, 0x70])) // ftyp
  ) {
    return 'video/mp4';
  }
  return null;
}

/**
 * Validates an uploaded media buffer against the SS-105 storage contract:
 * allowed MIME type, matching magic bytes, and the 10 MB size cap. Returns
 * the detected MIME type, which is authoritative for storage decisions.
 */
export function validateMediaFile(
  declaredMimeType: string,
  buffer: Buffer,
): AllowedMediaMimeType {
  if (buffer.length === 0) {
    throw new BadRequestException('فایل خالی است.');
  }
  if (buffer.length > MAX_MEDIA_SIZE_BYTES) {
    throw new BadRequestException('حجم فایل باید حداکثر ۱۰ مگابایت باشد.');
  }

  const detected = detectMediaMimeFromMagic(buffer);
  if (detected === null) {
    throw new BadRequestException(
      'فرمت فایل پشتیبانی نمیشود. فقط JPG، PNG، WEBP و MP4 مجاز است.',
    );
  }

  if (declaredMimeType !== detected) {
    throw new BadRequestException(
      'نوع فایل اعلامشده با محتوای واقعی فایل مطابقت ندارد.',
    );
  }

  return detected;
}

/** Safe storage extension for a validated MIME type. */
export function extensionForMediaMime(mimeType: AllowedMediaMimeType): string {
  return MIME_TO_EXTENSION[mimeType];
}

/** Whether a MIME type is an image (videos are never primary in M1). */
export function isImageMime(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType);
}

/** Maps a validated MIME type to the ProductMediaType enum. */
export function mediaTypeForMime(mimeType: AllowedMediaMimeType): ProductMediaType {
  return isImageMime(mimeType) ? ProductMediaType.IMAGE : ProductMediaType.VIDEO;
}

const UNSAFE_DISPLAY_NAME = /[/\\\0\r\n\t]/g;

/**
 * Sanitizes a user-provided filename for display/download headers only. The
 * original name is never used to derive storage keys or paths.
 */
export function sanitizeMediaDisplayName(
  originalName: string,
  fallback = 'media',
): string {
  const cleaned = originalName
    .replace(UNSAFE_DISPLAY_NAME, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._\s]+|[._\s]+$/g, '')
    .trim();

  if (!cleaned || cleaned === '.') {
    return fallback;
  }
  if (cleaned.length > 180) {
    const dot = cleaned.lastIndexOf('.');
    if (dot > 0) {
      const extension = cleaned.slice(dot + 1).slice(0, 8);
      const stem = cleaned.slice(0, Math.max(1, 180 - extension.length - 1));
      return `${stem}.${extension}`;
    }
    return cleaned.slice(0, 180);
  }
  return cleaned;
}
