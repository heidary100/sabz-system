import { describe, expect, it } from 'vitest'
import {
  AUDIT_ACTION_ORDER,
  AUDIT_ENTITY_ORDER,
  auditActionLabel,
  auditEntityLabel,
} from './audit-labels'

describe('audit labels (SS-271)', () => {
  it('translates catalog, inventory, and order codes that previously rendered raw', () => {
    expect(auditActionLabel('PRODUCT_PUBLISHED')).toBe('انتشار محصول')
    expect(auditActionLabel('INVENTORY_CONSUMED')).toBe('مصرف رزرو موجودی')
    expect(auditActionLabel('RETURN_COMPLETED')).toBe('تکمیل مرجوعی')
    expect(auditActionLabel('BLOG_POST_UPDATED')).toBe('به‌روزرسانی مطلب وبلاگ')
    expect(auditEntityLabel('ProductVariant')).toBe('نوع محصول')
    expect(auditEntityLabel('ReturnRequest')).toBe('درخواست مرجوعی')
  })

  it('keeps a defensive fallback for future codes', () => {
    expect(auditActionLabel('FUTURE_ACTION')).toBe('FUTURE_ACTION')
    expect(auditEntityLabel('FutureEntity')).toBe('FutureEntity')
  })

  it('exposes every labeled action and entity to the filter controls', () => {
    expect(AUDIT_ACTION_ORDER).toContain('PRODUCT_PUBLISHED')
    expect(AUDIT_ACTION_ORDER).toContain('RFQ_EXPIRED')
    expect(AUDIT_ENTITY_ORDER).toContain('Warehouse')
    expect(AUDIT_ACTION_ORDER.length).toBeGreaterThan(80)
    expect(AUDIT_ENTITY_ORDER.length).toBe(25)
  })
})
