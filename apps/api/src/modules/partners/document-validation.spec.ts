import { BadRequestException } from '@nestjs/common';
import {
  detectMimeFromMagic,
  extensionForMime,
  MAX_DOCUMENT_SIZE_BYTES,
  sanitizeDisplayName,
  validateDocumentFile,
} from './document-validation';

function pdfBuffer(): Buffer {
  return Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('test pdf content')]);
}

function pngBuffer(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('png content'),
  ]);
}

function jpegBuffer(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from('jpeg content'),
  ]);
}

describe('detectMimeFromMagic', () => {
  it('detects PDF magic bytes', () => {
    expect(detectMimeFromMagic(pdfBuffer())).toBe('application/pdf');
  });

  it('detects PNG magic bytes', () => {
    expect(detectMimeFromMagic(pngBuffer())).toBe('image/png');
  });

  it('detects JPEG magic bytes', () => {
    expect(detectMimeFromMagic(jpegBuffer())).toBe('image/jpeg');
  });

  it('returns null for unknown content', () => {
    expect(detectMimeFromMagic(Buffer.from('plain text content'))).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    expect(detectMimeFromMagic(Buffer.alloc(0))).toBeNull();
  });
});

describe('validateDocumentFile', () => {
  it('accepts a valid PDF with a matching declared MIME type', () => {
    expect(validateDocumentFile('application/pdf', pdfBuffer())).toBe('application/pdf');
  });

  it('accepts a valid PNG with a matching declared MIME type', () => {
    expect(validateDocumentFile('image/png', pngBuffer())).toBe('image/png');
  });

  it('accepts a valid JPEG with a matching declared MIME type', () => {
    expect(validateDocumentFile('image/jpeg', jpegBuffer())).toBe('image/jpeg');
  });

  it('rejects an empty file', () => {
    expect(() => validateDocumentFile('application/pdf', Buffer.alloc(0))).toThrow(
      BadRequestException,
    );
  });

  it('rejects a disallowed declared MIME type even with valid magic bytes', () => {
    expect(() => validateDocumentFile('text/plain', pdfBuffer())).toThrow(
      BadRequestException,
    );
  });

  it('rejects a MIME/magic mismatch (declared PDF, actual PNG)', () => {
    expect(() => validateDocumentFile('application/pdf', pngBuffer())).toThrow(
      BadRequestException,
    );
  });

  it('rejects unknown magic bytes regardless of the declared type', () => {
    expect(() => validateDocumentFile('application/pdf', Buffer.from('nope'))).toThrow(
      BadRequestException,
    );
  });

  it('rejects a file over the 10 MB limit', () => {
    const oversized = Buffer.concat([pdfBuffer(), Buffer.alloc(MAX_DOCUMENT_SIZE_BYTES)]);
    expect(() => validateDocumentFile('application/pdf', oversized)).toThrow(
      BadRequestException,
    );
  });

  it('accepts a file exactly at the 10 MB limit', () => {
    const atLimit = Buffer.concat([pdfBuffer(), Buffer.alloc(MAX_DOCUMENT_SIZE_BYTES - pdfBuffer().length)]);
    expect(() => validateDocumentFile('application/pdf', atLimit)).not.toThrow();
  });
});

describe('extensionForMime', () => {
  it('maps each allowed MIME type to its safe extension', () => {
    expect(extensionForMime('application/pdf')).toBe('pdf');
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('image/jpeg')).toBe('jpg');
  });
});

describe('sanitizeDisplayName', () => {
  it('preserves a clean display name', () => {
    expect(sanitizeDisplayName('business-license.pdf')).toBe('business-license.pdf');
  });

  it('strips path separators and control characters', () => {
    expect(sanitizeDisplayName('../../etc/passwd.pdf')).toBe('etc_passwd.pdf');
    expect(sanitizeDisplayName('a\\b\0c.pdf')).toBe('a_b_c.pdf');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeDisplayName('  license.pdf  ')).toBe('license.pdf');
  });

  it('falls back when the name is empty or purely separators', () => {
    expect(sanitizeDisplayName('')).toBe('document');
    expect(sanitizeDisplayName('////')).toBe('document');
  });

  it('truncates long names to 180 chars keeping a single extension', () => {
    const longName = `${'a'.repeat(200)}.pdf`;
    const result = sanitizeDisplayName(longName);
    expect(result.length).toBeLessThanOrEqual(180);
    expect(result.endsWith('.pdf')).toBe(true);
    expect(result.match(/\./g)).toHaveLength(1);
  });
});
