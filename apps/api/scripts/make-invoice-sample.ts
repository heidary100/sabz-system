import { writeFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import type { InvoiceDto } from '@sabz/types';
import { InvoicePdfService } from '../src/modules/orders/invoice-pdf.service';

const invoice: InvoiceDto = {
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
    address: 'بلوار پاسداران، روبروی مرکز تخصصی پرتو مازند، پلاک ۱۲، واحد ۳',
    postalCode: '4814938662',
  },
  items: [
    { id: '1', variantId: 'v1', productName: 'لپ‌تاپ ایسوس ROG Strix G16 مدل G614JV-N3094', variantName: 'نسخه ۱۶ گیگابایت / ۱ ترابایت', sku: 'ASUS-G16-16-1T', quantity: 1, unitPrice: '23100000', lineTotal: '23100000' },
    { id: '2', variantId: 'v2', productName: 'ماوس گیمینگ پرووان مدل BOLT PMG55', variantName: null, sku: 'PRV-BOLT-PMG55', quantity: 2, unitPrice: '1850000', lineTotal: '3700000' },
  ],
  note: 'لطفاً پیش از ارسال تماس بگیرید.',
  customerNationalIdMasked: '****5679',
  createdAt: '2026-11-16T12:30:00.000Z',
  customerMobile: '09121234567',
};
(async () => {
  const service = new InvoicePdfService(new ConfigService());
  const { buffer } = await service.render(invoice);
  writeFileSync('/tmp/opencode/sabz-invoice.pdf', buffer);
  console.log('/tmp/opencode/sabz-invoice.pdf', buffer.length);
})();
