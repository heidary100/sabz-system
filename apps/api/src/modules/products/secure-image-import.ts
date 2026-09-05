import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { createWriteStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { get as httpGet } from 'http';
import { get as httpsGet } from 'https';
import { isIP } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import type { LookupFunction } from 'net';

/** Same cap as direct uploads: images only, up to 5 MB. */
export const MAX_DESCRIPTION_IMAGE_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;

export interface DownloadedImage {
  filePath: string;
  dir: string;
}

/**
 * Whether an IP address is a private/reserved range that a server-side fetch
 * must never reach (SSRF protection). Blocks loopback, RFC1918, CGNAT,
 * link-local, multicast, reserved IPv4 and IPv6 documentation/ULA/multicast
 * ranges.
 */
export function isBlockedIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split('.').map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return true;
    }
    const n =
      (((((parts[0]! * 256) + parts[1]!) * 256) + parts[2]!) * 256 + parts[3]!) >>> 0;
    const inCidr = (base: number, prefix: number): boolean => {
      const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
      return (n & mask) === ((base >>> 0) & mask);
    };
    return (
      inCidr(0x00000000, 8) || // 0.0.0.0/8
      inCidr(0x0a000000, 8) || // 10.0.0.0/8
      inCidr(0x64400000, 10) || // 100.64.0.0/10 CGNAT
      inCidr(0x7f000000, 8) || // 127.0.0.0/8 loopback
      inCidr(0xa9fe0000, 16) || // 169.254.0.0/16 link-local
      inCidr(0xac100000, 12) || // 172.16.0.0/12
      inCidr(0xc0000000, 24) || // 192.0.0.0/24
      inCidr(0xc0000200, 24) || // 192.0.2.0/24 TEST-NET
      inCidr(0xc0a80000, 16) || // 192.168.0.0/16
      inCidr(0xc6120000, 15) || // 198.18.0.0/15 benchmark
      inCidr(0xc6336400, 24) || // 198.51.100.0/24 TEST-NET-2
      inCidr(0xcb007100, 24) || // 203.0.113.0/24 TEST-NET-3
      inCidr(0xe0000000, 4) || // 224.0.0.0/4 multicast
      inCidr(0xf0000000, 4) || // 240.0.0.0/4 reserved
      inCidr(0xffffffff, 32) // 255.255.255.255/32
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (/^f[cd]/.test(lower)) return true; // fc00::/7 ULA
    if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
    if (/^ff/.test(lower)) return true; // ff00::/8 multicast
    if (lower.startsWith('2001:db8')) return true; // documentation
    if (lower.startsWith('2001:10') || lower.startsWith('2001:20')) return true; // ORCHID
    if (lower.startsWith('2002:')) return true; // 6to4 (can embed private IPv4)
    if (lower.startsWith('2001:0')) return true; // Teredo (can embed private IPv4)
    // IPv4-mapped/compatible addresses (`::ffff:a.b.c.d`, `::ffff:xxxx:xxxx`,
    // `::a.b.c.d`) embed an IPv4 target and must be checked as IPv4.
    const mapped = /^::(?:ffff:)?(.+)$/.exec(lower);
    if (mapped) {
      const embedded = mapped[1]!;
      if (embedded.includes('.')) {
        return isBlockedIp(embedded);
      }
      if (/^[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(embedded)) {
        const [high, low] = embedded.split(':').map((part) => parseInt(part, 16));
        const n = ((high! << 16) + low!) >>> 0;
        return isBlockedIp(`${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`);
      }
    }
    return false;
  }
  // Not a parseable IP literal: blocked.
  return true;
}

/**
 * DNS lookup that resolves a hostname to a single public IP. Used as the
 * `lookup` option of the fetch request so the connection is pinned to a
 * validated address (mitigates DNS-rebinding between validation and connect).
 */
function pinnedLookup(): LookupFunction {
  return (hostname, _options, callback) => {
    lookup(hostname, { all: true, verbatim: true })
      .then((addresses) => {
        const publicAddress = addresses.find((entry) => !isBlockedIp(entry.address));
        if (!publicAddress) {
          callback(
            new BadRequestException('آدرس تصویر نامعتبر است.') as unknown as NodeJS.ErrnoException,
            '',
            0,
          );
          return;
        }
        callback(null, publicAddress.address, publicAddress.family === 6 ? 6 : 4);
      })
      .catch((error) =>
        callback(error as NodeJS.ErrnoException, '', 0),
      );
  };
}

interface DownloadResult {
  status: number;
  location?: string;
}

function requestOnce(
  url: URL,
  targetPath: string,
  allowPrivate: boolean,
): Promise<DownloadResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const transport = url.protocol === 'https:' ? httpsGet : httpGet;
    const request = transport(
      {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          'User-Agent': 'Sabz-System-Image-Importer/1.0',
          Accept: 'image/*,*/*;q=0.8',
        },
        timeout: REQUEST_TIMEOUT_MS,
        ...(allowPrivate ? {} : { lookup: pinnedLookup() }),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          resolvePromise({ status, location: response.headers.location });
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          resolvePromise({ status });
          return;
        }
        const out = createWriteStream(targetPath);
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_DESCRIPTION_IMAGE_IMPORT_BYTES) {
            request.destroy(
              new BadRequestException('حجم تصویر باید حداکثر ۵ مگابایت باشد.'),
            );
          }
        });
        response.pipe(out);
        out.on('error', rejectPromise);
        out.on('finish', () => resolvePromise({ status }));
      },
    );
    request.on('timeout', () => {
      request.destroy(new BadRequestException('دریافت تصویر از آدرس ناموفق بود.'));
    });
    request.on('error', (error) => rejectPromise(error));
  });
}

/**
 * Downloads a remote image to a temp file with SSRF protections:
 *   - protocol restricted to http/https;
 *   - hostname resolved and all addresses validated as public (private ranges
 *     blocked) with the connection pinned to the validated address;
 *   - redirects limited (each hop re-validated);
 *   - 5 MB stream cap and request timeout.
 * Callers remain responsible for deleting `filePath`/`dir`.
 */
export async function downloadImageToTemp(
  urlString: string,
  allowPrivate: boolean,
): Promise<DownloadedImage> {
  const first = new URL(urlString);
  if (first.protocol !== 'https:' && first.protocol !== 'http:') {
    throw new BadRequestException('آدرس تصویر باید https یا http باشد.');
  }
  if (!allowPrivate) {
    await assertPublicHost(first.hostname);
  }

  const dir = await mkdtemp(join(tmpdir(), 'sabz-img-import-'));
  let current = urlString;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const url = new URL(current);
    const filePath = join(dir, `img-${redirect}.bin`);
    const result = await requestOnce(url, filePath, allowPrivate);

    if (result.status >= 300 && result.status < 400 && result.location) {
      await rm(filePath, { force: true });
      current = new URL(result.location, url).toString();
      const next = new URL(current);
      if (next.protocol !== 'https:' && next.protocol !== 'http:') {
        throw new BadRequestException('آدرس تصویر باید https یا http باشد.');
      }
      if (!allowPrivate) {
        await assertPublicHost(next.hostname);
      }
      continue;
    }

    if (result.status < 200 || result.status >= 300) {
      await rm(filePath, { force: true });
      throw new BadRequestException('دریافت تصویر از آدرس ناموفق بود.');
    }

    return { filePath, dir };
  }

  throw new BadRequestException('تعداد ریدایرکت بیش از حد مجاز است.');
}

async function assertPublicHost(hostname: string): Promise<void> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some((entry) => isBlockedIp(entry.address))
  ) {
    throw new BadRequestException('آدرس تصویر نامعتبر است.');
  }
}