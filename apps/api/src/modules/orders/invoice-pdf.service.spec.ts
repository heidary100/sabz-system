import { existsSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import type { InvoiceDto } from '@sabz/types';
import { InvoicePdfService } from './invoice-pdf.service';

const CHROME = ['/usr/bin/chromium', '/usr/bin/google-chrome'].some((path) =>
  existsSync(path),
);
const describeIfChrome = CHROME ? describe : describe.skip;

const INVOICE: InvoiceDto = {
  id: 'order-1',
  orderNumber: 100007,
  status: 'DELIVERED',
  statusFa: 'تحویل شده',
  paymentMethod: 'COD',
  paymentStatus: 'PAID',
  subtotal: '23100000',
  shippingFee: '300000',
  total: '23400000',
  addressSnapshot: {
    fullName: 'محمد رضایی',
    phone: '09121234567',
    province: 'مازندران',
    city: 'ساری',
    address: 'بلوار پاسداران، پلاک ۱۲',
    postalCode: '4814938662',
  },
  items: [
    {
      id: '1',
      variantId: '11111111-1111-4111-8111-111111111111',
      productName: 'لپ‌تاپ ایسوس ROG Strix G16 مدل G614JV-N3094',
      variantName: 'نسخه ۱۶ گیگابایت / ۱ ترابایت',
      sku: 'ASUS-G16-16-1T',
      quantity: 1,
      unitPrice: '23100000',
      lineTotal: '23100000',
    },
    {
      id: '2',
      variantId: '22222222-2222-4222-8222-222222222222',
      productName: 'ماوس گیمینگ پرووان مدل BOLT PMG55',
      variantName: null,
      sku: 'PRV-BOLT-PMG55',
      quantity: 2,
      unitPrice: '1850000',
      lineTotal: '3700000',
    },
  ],
  note: 'لطفاً پیش از ارسال تماس بگیرید.',
  customerNationalIdMasked: '****5679',
  createdAt: '2026-11-16T12:30:00.000Z',
  customerMobile: '09121234567',
};

describe('InvoicePdfService (SS-900)', () => {
  const service = new InvoicePdfService(new ConfigService());

  it('builds escaped RTL HTML with the short invoice fields', () => {
    const html = service.buildHtml({
      ...INVOICE,
      note: '<script>alert(1)</script>',
    });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="fa"');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('****5679');
    expect(html).toContain('۲۳٬۱۰۰٬۰۰۰ ریال');
    expect(html).toContain('@page');
  });

  describeIfChrome('with headless Chromium', () => {
    it('renders a valid PDF from the real HTML template', async () => {
      const result = await service.render(INVOICE);
      expect(result.filename).toBe('sabz-invoice-100007.pdf');
      expect(result.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(result.buffer.length).toBeGreaterThan(20_000);
      expect(result.buffer.toString('latin1')).toContain('/Type /Page');
    }, 60_000);
  });
});
