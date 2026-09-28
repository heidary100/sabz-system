import { describe, expect, it } from 'vitest';
import { rfqStatusLabel } from './rfq';

describe('rfqStatusLabel', () => {
  it('labels every RFQ status in Persian', () => {
    expect(rfqStatusLabel('PENDING')).toBe('در انتظار استعلام');
    expect(rfqStatusLabel('QUOTED')).toBe('قیمت اعلام شد');
    expect(rfqStatusLabel('ACCEPTED')).toBe('پذیرفته شد');
    expect(rfqStatusLabel('REJECTED')).toBe('رد شد');
    expect(rfqStatusLabel('EXPIRED')).toBe('منقضی شد');
  });
});
