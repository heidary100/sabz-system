import { PartnerDocumentType } from '@prisma/client';
import { buildAttachmentDisposition } from './download-disposition';

describe('buildAttachmentDisposition', () => {
  it('carries the real UTF-8 filename in filename*', () => {
    const disposition = buildAttachmentDisposition({
      id: 'doc-1',
      type: PartnerDocumentType.BUSINESS_LICENSE,
      originalName: 'گواهی-فعالیت.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      createdAt: '2026-08-16T00:00:00.000Z',
    });

    const utf8Match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
    expect(utf8Match).toBeTruthy();
    expect(decodeURIComponent(utf8Match![1]!)).toBe('گواهی-فعالیت.pdf');
  });

  it('falls back to an ASCII-safe filename= for legacy clients', () => {
    const disposition = buildAttachmentDisposition({
      id: 'doc-1',
      type: PartnerDocumentType.SUPPORTING,
      originalName: 'گواهی-فعالیت.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      createdAt: '2026-08-16T00:00:00.000Z',
    });

    const asciiMatch = /filename="([^"]+)"/.exec(disposition);
    expect(asciiMatch).toBeTruthy();
    expect(asciiMatch![1]!).not.toMatch(/[^\x20-\x7E]/);
  });

  it('uses the document id with the mime extension when the name is empty', () => {
    const disposition = buildAttachmentDisposition({
      id: 'doc-1',
      type: PartnerDocumentType.NATIONAL_ID,
      originalName: '   ',
      mimeType: 'image/png',
      sizeBytes: 1,
      createdAt: '2026-08-16T00:00:00.000Z',
    });

    expect(disposition).toContain('filename="document-doc-1.png"');
  });

  it('sanitizes quotes in the ASCII fallback', () => {
    const disposition = buildAttachmentDisposition({
      id: 'doc-1',
      type: PartnerDocumentType.TAX_REGISTRATION,
      originalName: 'a"b.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      createdAt: '2026-08-16T00:00:00.000Z',
    });

    expect(disposition).toContain('filename="a\'b.pdf"');
  });
});
