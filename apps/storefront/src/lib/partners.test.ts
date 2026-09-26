import { describe, expect, it } from 'vitest';
import type { PartnerApplicationSummary } from '@sabz/types';
import {
  MAX_DOCUMENT_BYTES,
  PARTNER_DOCUMENT_TYPE_LABELS,
  PARTNER_STATUS_LABELS,
  parseApplication,
  submissionChecklist,
} from './partners';

function makeApplication(
  overrides: Partial<PartnerApplicationSummary> = {},
): PartnerApplicationSummary {
  return {
    id: 'partner-1',
    businessName: 'اکسیر الکترونیک',
    businessLicenseNo: 'LIC-123',
    nationalId: null,
    website: null,
    address: 'تهران، خیابان ولیعصر',
    city: 'تهران',
    province: 'تهران',
    approvalStatus: 'DRAFT',
    submittedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    approvedAt: null,
    tier: null,
    documents: [{ id: 'doc-1', type: 'BUSINESS_LICENSE', originalName: 'javaz.pdf', mimeType: 'application/pdf', sizeBytes: 100, createdAt: '2026-09-01T00:00:00.000Z' }],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('partner labels', () => {
  it('covers every approval status', () => {
    expect(Object.keys(PARTNER_STATUS_LABELS).sort()).toEqual([
      'APPROVED',
      'DRAFT',
      'PENDING',
      'REJECTED',
    ]);
  });

  it('covers every document type', () => {
    expect(Object.keys(PARTNER_DOCUMENT_TYPE_LABELS).sort()).toEqual([
      'BUSINESS_LICENSE',
      'NATIONAL_ID',
      'SUPPORTING',
      'TAX_REGISTRATION',
    ]);
  });

  it('pins the 10MB upload cap', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('submissionChecklist', () => {
  it('marks everything done on a submittable application', () => {
    const items = submissionChecklist(makeApplication());

    expect(items).toHaveLength(6);
    expect(items.every((item) => item.done)).toBe(true);
  });

  it('flags each missing field independently', () => {
    const items = submissionChecklist(
      makeApplication({
        businessLicenseNo: '  ',
        city: null,
        documents: [],
      }),
    );
    const byField = new Map(items.map((item) => [item.field, item.done]));

    expect(byField.get('businessName')).toBe(true);
    expect(byField.get('businessLicenseNo')).toBe(false);
    expect(byField.get('city')).toBe(false);
    expect(byField.get('licenseDocument')).toBe(false);
  });

  it('accepts non-license documents without satisfying the license row', () => {
    const items = submissionChecklist(
      makeApplication({
        documents: [{ id: 'doc-2', type: 'NATIONAL_ID', originalName: 'melli.png', mimeType: 'image/png', sizeBytes: 50, createdAt: '2026-09-01T00:00:00.000Z' }],
      }),
    );

    expect(items.find((item) => item.field === 'licenseDocument')?.done).toBe(false);
  });
});

describe('parseApplication', () => {
  it('accepts a well-formed summary', () => {
    expect(parseApplication(makeApplication())).toEqual(makeApplication());
  });

  it('rejects malformed payloads', () => {
    for (const payload of [
      undefined,
      null,
      {},
      { ...makeApplication(), approvalStatus: 'UNKNOWN' },
      { ...makeApplication(), documents: null },
      { ...makeApplication(), id: 42 },
    ]) {
      expect(() => parseApplication(payload)).toThrow();
    }
  });
});
