import { BadRequestException } from '@nestjs/common';
import {
  detectMediaMimeFromMagic,
  extensionForMediaMime,
  isImageMime,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  mediaTypeForMime,
  sanitizeMediaDisplayName,
  validateMediaFile,
} from './media-validation';

function imageBuffer(format: 'jpeg' | 'png' | 'webp' | 'mp4'): Buffer {
  if (format === 'jpeg') {
    return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  }
  if (format === 'png') {
    return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (format === 'webp') {
    return Buffer.concat([
      Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]),
      Buffer.from([0x57, 0x45, 0x42, 0x50]),
    ]);
  }
  // mp4 ftyp box
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from([0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
  ]);
}

describe('media validation (SS-105)', () => {
  describe('detectMediaMimeFromMagic', () => {
    it('detects jpeg magic bytes', () => {
      expect(detectMediaMimeFromMagic(imageBuffer('jpeg'))).toBe('image/jpeg');
    });
    it('detects png magic bytes', () => {
      expect(detectMediaMimeFromMagic(imageBuffer('png'))).toBe('image/png');
    });
    it('detects webp magic bytes (RIFF....WEBP)', () => {
      expect(detectMediaMimeFromMagic(imageBuffer('webp'))).toBe('image/webp');
    });
    it('detects mp4 ftyp signature', () => {
      expect(detectMediaMimeFromMagic(imageBuffer('mp4'))).toBe('video/mp4');
    });
    it('returns null for unknown content', () => {
      expect(detectMediaMimeFromMagic(Buffer.from('not a real file'))).toBeNull();
      expect(detectMediaMimeFromMagic(Buffer.from([]))).toBeNull();
    });
  });

  describe('validateMediaFile', () => {
    it('accepts a matching jpeg', () => {
      const header = imageBuffer('jpeg');
      expect(validateMediaFile('image/jpeg', header, header.length)).toBe('image/jpeg');
    });
    it('accepts a matching png', () => {
      const header = imageBuffer('png');
      expect(validateMediaFile('image/png', header, header.length)).toBe('image/png');
    });
    it('accepts a matching webp', () => {
      const header = imageBuffer('webp');
      expect(validateMediaFile('image/webp', header, header.length)).toBe('image/webp');
    });
    it('accepts a matching mp4', () => {
      const header = imageBuffer('mp4');
      expect(validateMediaFile('video/mp4', header, header.length)).toBe('video/mp4');
    });
    it('rejects an empty file', () => {
      expect(() => validateMediaFile('image/png', Buffer.from([]), 0)).toThrow(
        BadRequestException,
      );
    });
    it('rejects a MIME/magic mismatch', () => {
      const header = imageBuffer('jpeg');
      expect(() => validateMediaFile('image/png', header, header.length)).toThrow(
        BadRequestException,
      );
    });
    it('rejects an unsupported declared MIME with unsupported content', () => {
      expect(() =>
        validateMediaFile('application/pdf', Buffer.from('text'), 4),
      ).toThrow(BadRequestException);
    });
    it('accepts an image exactly at the 10 MB boundary', () => {
      const header = imageBuffer('png');
      expect(
        validateMediaFile('image/png', header, MAX_IMAGE_SIZE_BYTES),
      ).toBe('image/png');
    });
    it('rejects an image over the 10 MB cap with the image message', () => {
      const header = imageBuffer('png');
      try {
        validateMediaFile('image/png', header, MAX_IMAGE_SIZE_BYTES + 1);
        throw new Error('expected to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).message).toBe(
          'حجم تصویر باید حداکثر ۱۰ مگابایت باشد.',
        );
      }
    });
    it('accepts a video exactly at the 200 MB boundary', () => {
      const header = imageBuffer('mp4');
      expect(
        validateMediaFile('video/mp4', header, MAX_VIDEO_SIZE_BYTES),
      ).toBe('video/mp4');
    });
    it('accepts a video over 10 MB but within the 200 MB video cap', () => {
      const header = imageBuffer('mp4');
      expect(
        validateMediaFile('video/mp4', header, 100 * 1024 * 1024),
      ).toBe('video/mp4');
    });
    it('rejects a video over the 200 MB cap with the video message', () => {
      const header = imageBuffer('mp4');
      try {
        validateMediaFile('video/mp4', header, MAX_VIDEO_SIZE_BYTES + 1);
        throw new Error('expected to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).message).toBe(
          'حجم ویدئو باید حداکثر ۲۰۰ مگابایت باشد.',
        );
      }
    });
    it('enforces the image cap independently of the larger video cap', () => {
      const header = imageBuffer('png');
      expect(() =>
        validateMediaFile('image/png', header, MAX_VIDEO_SIZE_BYTES),
      ).toThrow(BadRequestException);
    });
  });

  describe('helpers', () => {
    it('maps MIME to a safe storage extension', () => {
      expect(extensionForMediaMime('image/jpeg')).toBe('jpg');
      expect(extensionForMediaMime('image/png')).toBe('png');
      expect(extensionForMediaMime('image/webp')).toBe('webp');
      expect(extensionForMediaMime('video/mp4')).toBe('mp4');
    });
    it('classifies image vs video MIME', () => {
      expect(isImageMime('image/jpeg')).toBe(true);
      expect(isImageMime('video/mp4')).toBe(false);
    });
    it('maps MIME to the media type enum', () => {
      expect(mediaTypeForMime('image/jpeg')).toBe('IMAGE');
      expect(mediaTypeForMime('video/mp4')).toBe('VIDEO');
    });
  });

  describe('sanitizeMediaDisplayName', () => {
    it('replaces unsafe path/control characters', () => {
      expect(sanitizeMediaDisplayName('a/b\\c\0.jpg')).toBe('a_b_c_.jpg');
    });
    it('collapses runs of dots and trims leading/trailing separators', () => {
      expect(sanitizeMediaDisplayName('...file...jpg...')).toBe('file.jpg');
    });
    it('falls back when empty', () => {
      expect(sanitizeMediaDisplayName('')).toBe('media');
      expect(sanitizeMediaDisplayName('  ')).toBe('media');
    });
    it('truncates long names but keeps the extension', () => {
      const long = `${'a'.repeat(200)}.jpg`;
      const result = sanitizeMediaDisplayName(long);
      expect(result.length).toBeLessThanOrEqual(180);
      expect(result.endsWith('.jpg')).toBe(true);
    });
  });
});
