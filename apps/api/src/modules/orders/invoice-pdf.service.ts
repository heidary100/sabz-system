import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { InvoiceDto, OrderItemDto } from '@sabz/types';

const execFileAsync = promisify(execFile);

const faNumber = new Intl.NumberFormat('fa-IR');
const faDate = new Intl.DateTimeFormat('fa-IR', {
  calendar: 'persian',
  timeZone: 'Asia/Tehran',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

/**
 * Print-ready order invoice PDF (SS-900).
 *
 * Rendering uses headless Chromium so Persian shaping, bidi ordering and font
 * embedding are handled by the browser engine rather than a hand-rolled
 * shaper. The Vazirmatn font and transparent logo are embedded as data URIs,
 * so the PDF is self-contained and prints consistently offline.
 *
 * Configuration: CHROME_PATH (default auto-detected), INVOICE_FONT_PATH,
 * INVOICE_LOGO_PATH, optional COMPANY_* display values. Missing Chromium is a
 * clear 503, never a broken download.
 */
@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(private readonly config: ConfigService) {}

  async render(invoice: InvoiceDto): Promise<{ buffer: Buffer; filename: string }> {
    const chrome = this.resolveChrome();
    const html = this.buildHtml(invoice);
    const dir = await mkdtemp(join(tmpdir(), 'sabz-invoice-'));
    const htmlPath = join(dir, 'invoice.html');
    const pdfPath = join(dir, 'invoice.pdf');
    try {
      await writeFile(htmlPath, html, 'utf8');
      const args = [
        '--headless',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-pdf-header-footer',
        '--font-render-hinting=none',
        `--print-to-pdf=${pdfPath}`,
        `file://${htmlPath}`,
      ];
      if (this.config.get<string>('PDF_CHROME_NO_SANDBOX', 'true') !== 'false') {
        args.unshift('--no-sandbox');
      }
      await execFileAsync(chrome, args, {
        timeout: 45_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      if (!existsSync(pdfPath)) {
        throw new Error('Chromium did not produce a PDF file.');
      }
      const buffer = readFileSync(pdfPath);
      if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new Error('Generated file is not a valid PDF.');
      }
      return {
        buffer,
        filename: `sabz-invoice-${invoice.orderNumber}.pdf`,
      };
    } catch (error) {
      this.logger.error(
        `Invoice PDF failed order=${invoice.orderNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException(
        'تولید فایل PDF فاکتور در این سرور ممکن نیست؛ لطفاً از نسخه چاپی استفاده کنید.',
      );
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private resolveChrome(): string {
    const configured = this.config.get<string>('CHROME_PATH')?.trim();
    const candidates = [
      configured,
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ].filter((value): value is string => Boolean(value));
    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
      throw new ServiceUnavailableException(
        'موتور تولید PDF در این سرور نصب نشده است.',
      );
    }
    return found;
  }

  /** Exposed for unit tests: deterministic, escaped RTL invoice HTML. */
  buildHtml(invoice: InvoiceDto): string {
    const fontPath = resolve(
      this.config.get<string>(
        'INVOICE_FONT_PATH',
        'assets/watermark/fonts/Vazirmatn-Regular.ttf',
      ),
    );
    const logoPath = resolve(
      this.config.get<string>('INVOICE_LOGO_PATH', 'assets/brand/logo.png'),
    );
    const font = existsSync(fontPath)
      ? readFileSync(fontPath).toString('base64')
      : null;
    const logo = existsSync(logoPath)
      ? readFileSync(logoPath).toString('base64')
      : null;
    const company = {
      name: this.config.get<string>('COMPANY_LEGAL_NAME', 'سبز سیستم'),
      address: this.config.get<string>('COMPANY_ADDRESS', ''),
      phone: this.config.get<string>('COMPANY_PHONE', ''),
      website: this.config.get<string>('COMPANY_WEBSITE', ''),
    };
    const items = mergeInvoiceItems(invoice.items);
    const rows = items
      .map(
        (item, index) => `<tr>
          <td class="num">${faNumber.format(index + 1)}</td>
          <td class="desc">${escapeHtml(item.productName)}${
            item.variantName ? ` — ${escapeHtml(item.variantName)}` : ''
          }<span class="sku" dir="ltr">${escapeHtml(item.sku)}</span></td>
          <td class="num">${faNumber.format(item.quantity)}</td>
          <td class="num">${formatRial(item.unitPrice)}</td>
          <td class="num strong">${formatRial(item.lineTotal)}</td>
        </tr>`,
      )
      .join('');
    const created = new Date(invoice.createdAt);
    const dateText = Number.isNaN(created.getTime())
      ? ''
      : faDate.format(created);
    return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>فاکتور ${escapeHtml(String(invoice.orderNumber))}</title>
<style>
  ${font ? `@font-face { font-family: 'Vazirmatn'; src: url(data:font/ttf;base64,${font}) format('truetype'); font-weight: 400; font-style: normal; }` : ''}
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Vazirmatn', sans-serif; color: #1b1f1d; font-size: 10.5pt; line-height: 1.7; }
  .sheet { width: 100%; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 2px solid #16a54b; padding-bottom: 10px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { width: 54px; height: 54px; object-fit: contain; }
  .brand h1 { margin: 0; font-size: 17pt; color: #0b6b2f; }
  .brand p { margin: 2px 0 0; font-size: 8.5pt; color: #707271; }
  .meta { text-align: left; font-size: 9pt; color: #4c514e; }
  .meta strong { color: #1b1f1d; }
  .title { margin: 14px 0 10px; font-size: 13pt; font-weight: 700; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .box { border: 1px solid #dde3df; border-radius: 8px; padding: 8px 10px; background: #f7f9f8; }
  .box h2 { margin: 0 0 4px; font-size: 9.5pt; color: #0b6b2f; }
  .box p { margin: 2px 0; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border-bottom: 1px solid #e1e6e2; padding: 6px 5px; vertical-align: top; font-size: 9.2pt; }
  th { background: #eff2f0; color: #0b6b2f; font-size: 8.8pt; }
  td.num, th.num { text-align: center; white-space: nowrap; }
  td.desc { text-align: right; }
  .sku { display: block; color: #707271; font-size: 7.8pt; margin-top: 1px; }
  .strong { font-weight: 700; }
  .totals { width: 48%; margin-inline-start: auto; margin-top: 10px; }
  .totals div { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px dashed #e1e6e2; font-size: 9.5pt; }
  .totals .grand { border-top: 2px solid #16a54b; border-bottom: 0; margin-top: 3px; padding-top: 6px; font-size: 11pt; font-weight: 700; color: #0b6b2f; }
  .note { margin-top: 10px; border: 1px solid #dde3df; border-radius: 8px; padding: 7px 10px; font-size: 8.8pt; color: #4c514e; }
  .footer { margin-top: 14px; border-top: 1px solid #dde3df; padding-top: 6px; font-size: 8pt; color: #707271; display: flex; justify-content: space-between; gap: 10px; }
  .avoid { page-break-inside: avoid; }
</style>
</head>
<body>
<div class="sheet">
  <header class="header">
    <div class="brand">
      ${logo ? `<img src="data:image/png;base64,${logo}" alt="" />` : ''}
      <div>
        <h1>${escapeHtml(company.name)}</h1>
        ${company.address ? `<p>${escapeHtml(company.address)}</p>` : ''}
        <p>${[company.phone, company.website].filter(Boolean).map(escapeHtml).join(' — ')}</p>
      </div>
    </div>
    <div class="meta">
      <div>فاکتور فروش <strong>${escapeHtml(String(invoice.orderNumber))}</strong></div>
      <div>تاریخ: ${escapeHtml(dateText)}</div>
      <div>وضعیت: ${escapeHtml(invoice.statusFa)}</div>
      <div>پرداخت: ${escapeHtml(invoice.paymentMethod === 'COD' ? 'پرداخت در محل' : 'پرداخت آنلاین')} — ${escapeHtml(invoice.paymentStatus === 'PAID' ? 'پرداخت‌شده' : invoice.paymentStatus === 'FAILED' ? 'ناموفق' : 'در انتظار پرداخت')}</div>
    </div>
  </header>

  <h2 class="title">مشخصات خریدار و تحویل</h2>
  <div class="grid avoid">
    <div class="box">
      <h2>خریدار</h2>
      <p>${escapeHtml(invoice.addressSnapshot.fullName)}</p>
      <p dir="ltr" style="text-align:right">${escapeHtml(invoice.addressSnapshot.phone)}</p>
      ${invoice.customerMobile ? `<p dir="ltr" style="text-align:right">${escapeHtml(invoice.customerMobile)}</p>` : ''}
      ${invoice.customerNationalIdMasked ? `<p>کد ملی: <span dir="ltr">${escapeHtml(invoice.customerNationalIdMasked)}</span></p>` : ''}
    </div>
    <div class="box">
      <h2>نشانی تحویل</h2>
      <p>${escapeHtml([invoice.addressSnapshot.province, invoice.addressSnapshot.city, invoice.addressSnapshot.address].filter(Boolean).join('، '))}</p>
      ${invoice.addressSnapshot.postalCode ? `<p>کد پستی: <span dir="ltr">${escapeHtml(invoice.addressSnapshot.postalCode)}</span></p>` : ''}
    </div>
  </div>

  <table>
    <thead><tr>
      <th class="num">ردیف</th>
      <th class="desc">شرح کالا</th>
      <th class="num">تعداد</th>
      <th class="num">مبلغ واحد (ریال)</th>
      <th class="num">مبلغ کل (ریال)</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals avoid">
    <div><span>جمع اقلام</span><span>${formatRial(invoice.subtotal)}</span></div>
    <div><span>هزینه ارسال</span><span>${formatRial(invoice.shippingFee)}</span></div>
    <div class="grand"><span>مبلغ قابل پرداخت</span><span>${formatRial(invoice.total)}</span></div>
  </div>

  ${invoice.note ? `<div class="note avoid"><strong>یادداشت سفارش:</strong> ${escapeHtml(invoice.note)}</div>` : ''}

  <footer class="footer">
    <span>این فاکتور به صورت الکترونیکی صادر شده است.</span>
    <span>${escapeHtml(company.name)}</span>
  </footer>
</div>
</body>
</html>`;
  }
}

function mergeInvoiceItems(items: OrderItemDto[]): OrderItemDto[] {
  const merged = new Map<string, OrderItemDto>();
  for (const item of items) {
    const key = `${item.variantId}:${item.unitPrice}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item });
      continue;
    }
    const quantity = existing.quantity + item.quantity;
    merged.set(key, {
      ...existing,
      quantity,
      lineTotal: (
        Number(existing.unitPrice) * quantity
      ).toFixed(2),
    });
  }
  return [...merged.values()];
}

function formatRial(value: string): string {
  const number = Number(value);
  return `${faNumber.format(Number.isFinite(number) ? number : 0)} ریال`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
