import { BadRequestException } from '@nestjs/common';
import {
  backoffMs,
  basenameForUrl,
  downloadMediaToTemp,
  isAllowedHost,
  isRetryable,
  isRetryableStatus,
  MediaFetchError,
  validateDownloadedBytes,
} from './woo-media';
import { renderMediaSummary, type MediaReport } from './woo-media-runner';

/**
 * Bulk media downloader core unit tests (SS-208).
 *
 * Pure helpers (allowlist, backoff, retry classification, naming,
 * byte validation) plus the fetch SSRF/allowlist gates. No network is
 * touched: unlisted hosts and private IPs reject before any socket.
 */
describe('woo-media core (SS-208)', () => {
  describe('backoffMs', () => {
    it('backs off exponentially with an 8s cap', () => {
      expect(backoffMs(1)).toBe(1000);
      expect(backoffMs(2)).toBe(2000);
      expect(backoffMs(3)).toBe(4000);
      expect(backoffMs(10)).toBe(8000);
    });
  });

  describe('isRetryableStatus', () => {
    it.each([408, 429, 500, 502, 503])('retries status %i', (status) => {
      expect(isRetryableStatus(status)).toBe(true);
    });
    it.each([200, 400, 401, 403, 404])('never retries status %i', (status) => {
      expect(isRetryableStatus(status)).toBe(false);
    });
  });

  describe('isRetryable', () => {
    it('retries transient fetch errors only', () => {
      expect(isRetryable(new MediaFetchError('x', true, 503))).toBe(true);
      expect(isRetryable(new MediaFetchError('x', false, 404))).toBe(false);
      expect(isRetryable(new BadRequestException('x'))).toBe(false);
      expect(isRetryable(new Error('x'))).toBe(false);
    });
  });

  describe('isAllowedHost', () => {
    it('allows the seed domain and subdomains', () => {
      expect(isAllowedHost('sabzsistem.com')).toBe(true);
      expect(isAllowedHost('cdn.sabzsistem.com')).toBe(true);
      expect(isAllowedHost('SABZSISTEM.COM')).toBe(true);
    });
    it('rejects lookalikes and unrelated hosts', () => {
      expect(isAllowedHost('evilsabzsistem.com')).toBe(false);
      expect(isAllowedHost('sabzsistem.com.evil.com')).toBe(false);
      expect(isAllowedHost('example.com')).toBe(false);
      expect(isAllowedHost('')).toBe(false);
    });
    it('honors explicit extra hosts', () => {
      expect(isAllowedHost('cdn.example.com', ['cdn.example.com'])).toBe(true);
      expect(isAllowedHost('sub.cdn.example.com', ['cdn.example.com'])).toBe(true);
      expect(isAllowedHost('other.example.com', ['cdn.example.com'])).toBe(false);
    });
  });

  describe('basenameForUrl', () => {
    it('takes the last path segment, falling back when empty', () => {
      expect(basenameForUrl('https://cdn.example.com/img/a.jpg?x=1', 'fallback.jpg')).toBe(
        'a.jpg',
      );
      expect(basenameForUrl('https://cdn.example.com/', 'fallback.jpg')).toBe(
        'fallback.jpg',
      );
      expect(basenameForUrl('not a url', 'fallback.jpg')).toBe('fallback.jpg');
    });
  });

  describe('validateDownloadedBytes', () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    it('accepts recognized signatures within caps', () => {
      expect(validateDownloadedBytes(jpegHeader, 1024)).toBe('image/jpeg');
    });
    it('rejects empty payloads', () => {
      expect(() => validateDownloadedBytes(Buffer.alloc(0), 0)).toThrow(
        BadRequestException,
      );
    });
    it('rejects unknown signatures', () => {
      expect(() =>
        validateDownloadedBytes(Buffer.from([0x00, 0x01, 0x02, 0x03]), 64),
      ).toThrow(BadRequestException);
    });
    it('rejects oversized payloads', () => {
      expect(() => validateDownloadedBytes(jpegHeader, 11 * 1024 * 1024)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('downloadMediaToTemp gates', () => {
    it('rejects unlisted hosts without touching the network', async () => {
      await expect(downloadMediaToTemp('https://example.com/x.jpg', {})).rejects.toThrow(
        BadRequestException,
      );
    });
    it('rejects private IPs via SSRF pinning', async () => {
      await expect(
        downloadMediaToTemp('http://127.0.0.1/x.jpg', {
          extraHosts: ['127.0.0.1'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
    it('rejects non-http(s) protocols', async () => {
      await expect(
        downloadMediaToTemp('ftp://sabzsistem.com/x.jpg', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('renderMediaSummary', () => {
    it('renders the images matrix and failures', () => {
      const report: MediaReport = {
        generatedAt: new Date().toISOString(),
        file: 'export.csv',
        runId: 'run-1',
        dryRun: false,
        rows: 8,
        products: 3,
        images: { refs: 4, downloaded: 3, processed: 3, failed: 1, skippedDedup: 0 },
        resumed: 0,
        failures: [{ line: 2, sourceId: '9001', url: 'https://x/b.jpg', error: 'boom' }],
        decisions: ['ruling'],
      };
      const summary = renderMediaSummary(report);
      expect(summary).toContain('refs 4 / downloaded 3 / processed 3 / failed 1 / skipped-dedup 0');
      expect(summary).toContain('https://x/b.jpg');
    });
  });
});
