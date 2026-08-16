import { BadRequestException } from '@nestjs/common';

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const;

export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

/** File extension emitted from a validated MIME type; never from filenames. */
const MIME_TO_EXTENSION: Record<AllowedDocumentMimeType, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

/**
 * Detects the real document format from magic bytes. The client-declared MIME
 * type is never trusted for storage decisions.
 */
export function detectMimeFromMagic(buffer: Buffer): AllowedDocumentMimeType | null {
  if (buffer.length >= PDF_MAGIC.length && buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return 'application/pdf';
  }
  if (buffer.length >= PNG_MAGIC.length && buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return 'image/png';
  }
  if (buffer.length >= JPEG_MAGIC.length && buffer.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) {
    return 'image/jpeg';
  }
  return null;
}

/**
 * Validates an uploaded document buffer against the SS-038 storage contract:
 * allowed MIME type, matching magic bytes, and the 10 MB size cap.
 */
export function validateDocumentFile(
  declaredMimeType: string,
  buffer: Buffer,
): AllowedDocumentMimeType {
  if (buffer.length === 0) {
    throw new BadRequestException('فایل خالی است.');
  }
  if (buffer.length > MAX_DOCUMENT_SIZE_BYTES) {
    throw new BadRequestException('حجم فایل باید حداکثر ۱۰ مگابایت باشد.');
  }

  const detected = detectMimeFromMagic(buffer);
  if (detected === null) {
    throw new BadRequestException(
      'فرمت فایل پشتیبانی نمیشود. فقط PDF، PNG و JPG مجاز است.',
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
export function extensionForMime(mimeType: AllowedDocumentMimeType): string {
  return MIME_TO_EXTENSION[mimeType];
}

const UNSAFE_DISPLAY_NAME = /[/\\\0\r\n\t]/g;

/**
 * Sanitizes a user-provided filename for display/download headers only. The
 * original name is never used to derive storage keys or paths.
 */
export function sanitizeDisplayName(
  originalName: string,
  fallback = 'document',
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
