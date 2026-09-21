import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import type { LookupFunction } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isBlockedIp } from '../products/secure-image-import';
import { readFileHeader } from '../products/media-file';
import {
  detectMediaMimeFromMagic,
  MEDIA_HEADER_READ_BYTES,
  maxSizeBytesForMime,
  maxVideoSizeBytes,
  sizeLimitMessageForMime,
  type AllowedMediaMimeType,
} from '../products/media-validation';

/**
 * Bulk media downloader core (SS-208).
 *
 * Pure helpers plus the URL→temp-file fetch used by the media runner. The
 * fetch mirrors the SSRF protections of `secure-image-import.ts` (public-IP
 * pinning, redirect re-validation) but with product-media caps (10 MB images,
 * 200 MB videos from `media-validation.ts`) instead of the 5 MB
 * description-image cap — the two pipelines have different contracts and must
 * not share a byte limit.
 */

/** Audit source system for media runs. Distinct from the writer's
 * `WOOCOMMERCE` so media ImportRecords never satisfy writer resume lookups
 * (and vice versa): both key on `(sourceSystem, sourceId)` + row hash. */
export const MEDIA_SOURCE_SYSTEM = 'WOOCOMMERCE_MEDIA';

/** Storage-key prefix of SS-207 reference placeholders awaiting binaries. */
export const PENDING_MEDIA_PREFIX = 'pending-woo';

/** Default worker count: in-process batching, no queue/broker (per issue). */
export const DEFAULT_MEDIA_CONCURRENCY = 6;
/** Per-image fetch attempts (initial try + retries). */
export const MEDIA_MAX_ATTEMPTS = 3;
export const MEDIA_HEAD_TIMEOUT_MS = 15_000;
/** Per-item ceiling: one corrupt 200 MB video must never stall the run. */
export const MEDIA_GET_TIMEOUT_MS = 60_000;
export const MEDIA_MAX_REDIRECTS = 3;

/** Same-domain allowlist seed (explicit `--allow-host` adds more). */
export const DEFAULT_MEDIA_ALLOWED_HOSTS = ['sabzsistem.com'];

/** Actor recorded on media rows backfilled by the importer. */
export const MEDIA_IMPORT_ACTOR = 'woo-import-media';

export interface DownloadOptions {
  /** Extra allowed hosts beyond the `sabzsistem.com` seed. */
  extraHosts?: string[];
  /** Test/staging escape: skip SSRF pinning (never default true). */
  allowPrivate?: boolean;
  timeoutMs?: number;
  /** Stream cap; defaults to the video cap (largest supported asset). */
  maxBytes?: number;
}

export interface DownloadedMedia {
  filePath: string;
  dir: string;
  sizeBytes: number;
  /** SHA-256 hex of the received source bytes (SS-204 dedup identity). */
  contentHash: string;
  detectedMime: AllowedMediaMimeType;
}

export interface MediaProbe {
  url: string;
  status: number;
  location: string | null;
  contentType: string | null;
  contentLength: number | null;
}

/**
 * Fetch failure with retry semantics. Validation/allowlist/SSRF rejections
 * are `BadRequestException` (fatal); network/timeout/5xx failures are
 * `MediaFetchError` with `retryable` set by status.
 */
export class MediaFetchError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, retryable: boolean, status: number | null = null) {
    super(message);
    this.name = 'MediaFetchError';
    this.retryable = retryable;
    this.status = status;
  }
}

/** Exponential backoff between attempts (1-based), capped at 8 s. */
export function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** (Math.max(1, attempt) - 1), 8000);
}

/** True for transient statuses worth retrying (408/429/5xx). */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export function isRetryable(error: unknown): boolean {
  return error instanceof MediaFetchError && error.retryable;
}

/** Host allowlist: exact or subdomain match, case-insensitive. */
export function isAllowedHost(hostname: string, extraHosts: string[] = []): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) {
    return false;
  }
  const allowed = [...DEFAULT_MEDIA_ALLOWED_HOSTS, ...extraHosts].map((entry) =>
    entry.trim().toLowerCase(),
  );
  return allowed.some(
    (entry) => entry !== '' && (host === entry || host.endsWith(`.${entry}`)),
  );
}

/** Display filename from a URL path (never used for storage keys). */
export function basenameForUrl(urlString: string, fallback: string): string {
  try {
    const path = new URL(urlString).pathname;
    const base = path.split('/').filter(Boolean).pop();
    if (base) {
      return base.slice(0, 255);
    }
  } catch {
    // Fall through to the fallback below.
  }
  return fallback;
}

/**
 * Validates downloaded bytes against the product-media contract: recognized
 * magic bytes + per-type size cap. Returns the authoritative detected MIME.
 */
export function validateDownloadedBytes(
  header: Buffer,
  sizeBytes: number,
): AllowedMediaMimeType {
  if (header.length === 0 || sizeBytes === 0) {
    throw new BadRequestException('فایل خالی است.');
  }
  const detected = detectMediaMimeFromMagic(header);
  if (detected === null) {
    throw new BadRequestException(
      'فرمت فایل پشتیبانی نمیشود. فقط JPG، PNG، WEBP و MP4 مجاز است.',
    );
  }
  if (sizeBytes > maxSizeBytesForMime(detected)) {
    throw new BadRequestException(sizeLimitMessageForMime(detected));
  }
  return detected;
}

/**
 * DNS lookup pinned to a single public IP (mirrors `secure-image-import.ts`).
 * Mitigates DNS-rebinding between validation and connect.
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
      .catch((error) => callback(error as NodeJS.ErrnoException, '', 0));
  };
}

async function assertPublicHost(hostname: string): Promise<void> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new BadRequestException('آدرس تصویر نامعتبر است.');
  }
}

function assertFetchableUrl(urlString: string, extraHosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new BadRequestException('آدرس تصویر باید https یا http باشد.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException('آدرس تصویر باید https یا http باشد.');
  }
  if (!isAllowedHost(url.hostname, extraHosts)) {
    throw new BadRequestException('دامنه تصویر مجاز نیست.');
  }
  return url;
}

interface GetResult {
  status: number;
  location?: string;
}

/** Single GET into `targetPath` with byte-cap abort and SHA-256 streaming. */
function requestOnce(
  url: URL,
  targetPath: string,
  hash: ReturnType<typeof createHash>,
  options: Required<Pick<DownloadOptions, 'allowPrivate'>> & {
    timeoutMs: number;
    maxBytes: number;
  },
): Promise<GetResult & { bytes: number }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const transport = url.protocol === 'https:' ? httpsGet : httpGet;
    const request = transport(
      {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          'User-Agent': 'Sabz-System-Media-Importer/1.0',
          Accept: 'image/*,video/mp4,*/*;q=0.8',
        },
        timeout: options.timeoutMs,
        ...(options.allowPrivate ? {} : { lookup: pinnedLookup() }),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          resolvePromise({ status, location: response.headers.location, bytes: 0 });
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          rejectPromise(
            new MediaFetchError(
              `دریافت تصویر از آدرس ناموفق بود (وضعیت ${status}).`,
              isRetryableStatus(status),
              status,
            ),
          );
          return;
        }
        const out = createWriteStream(targetPath);
        let bytes = 0;
        let aborted = false;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          hash.update(chunk);
          if (bytes > options.maxBytes) {
            aborted = true;
            request.destroy(
              new BadRequestException('حجم فایل از سقف مجاز بیشتر است.'),
            );
          }
        });
        response.pipe(out);
        out.on('error', (error) => {
          if (!aborted) {
            rejectPromise(
              new MediaFetchError(
                error instanceof Error ? error.message : 'خطا در ذخیره‌سازی موقت فایل.',
                true,
              ),
            );
          }
        });
        out.on('finish', () => {
          if (!aborted) {
            resolvePromise({ status, bytes });
          }
        });
      },
    );
    request.on('timeout', () => {
      request.destroy(
        new MediaFetchError('دریافت تصویر از آدرس ناموفق بود (مهلت تمام شد).', true),
      );
    });
    request.on('error', (error) => {
      if (error instanceof BadRequestException) {
        rejectPromise(error);
        return;
      }
      rejectPromise(
        error instanceof MediaFetchError
          ? error
          : new MediaFetchError(
              error instanceof Error ? error.message : 'خطای شبکه در دریافت تصویر.',
              true,
            ),
      );
    });
  });
}

/**
 * Downloads a remote media file to a temp file with SSRF protections
 * (protocol + allowlist + public-IP pinning + redirect re-validation),
 * per-item timeout, and stream byte-cap. Callers own `filePath`/`dir`
 * cleanup (see `cleanupDownloaded`).
 */
export async function downloadMediaToTemp(
  urlString: string,
  options: DownloadOptions = {},
): Promise<DownloadedMedia> {
  const extraHosts = options.extraHosts ?? [];
  const allowPrivate = options.allowPrivate ?? false;
  const timeoutMs = options.timeoutMs ?? MEDIA_GET_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? maxVideoSizeBytes();

  const first = assertFetchableUrl(urlString, extraHosts);
  if (!allowPrivate) {
    await assertPublicHost(first.hostname);
  }

  const dir = await mkdtemp(join(tmpdir(), 'sabz-media-import-'));
  try {
    let current = urlString;
    for (let redirect = 0; ; redirect += 1) {
      const url = assertFetchableUrl(current, extraHosts);
      if (!allowPrivate) {
        await assertPublicHost(url.hostname);
      }
      const filePath = join(dir, `media-${redirect}.bin`);
      const hash = createHash('sha256');
      const result = await requestOnce(url, filePath, hash, {
        allowPrivate,
        timeoutMs,
        maxBytes,
      });
      if (result.status >= 300 && result.status < 400 && result.location) {
        if (redirect >= MEDIA_MAX_REDIRECTS) {
          throw new MediaFetchError('تعداد ریدایرکت بیش از حد مجاز است.', false);
        }
        current = new URL(result.location, url).toString();
        continue;
      }
      const contentHash = hash.digest('hex');
      // Validation reads only the header; the size comes from the stream.
      const header = await readFileHeader(filePath, MEDIA_HEADER_READ_BYTES);
      const detectedMime = validateDownloadedBytes(header, result.bytes);
      return { filePath, dir, sizeBytes: result.bytes, contentHash, detectedMime };
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

/** Best-effort removal of a download's temp directory. */
export async function cleanupDownloaded(downloaded: DownloadedMedia): Promise<void> {
  try {
    await rm(downloaded.dir, { recursive: true, force: true });
  } catch {
    // Temp cleanup never masks the import result.
  }
}

/** Header probe for dry-run mode (no writes): status + content hints. */
export function probeMediaUrl(
  urlString: string,
  options: DownloadOptions = {},
): Promise<MediaProbe> {
  const extraHosts = options.extraHosts ?? [];
  const allowPrivate = options.allowPrivate ?? false;
  const timeoutMs = options.timeoutMs ?? MEDIA_HEAD_TIMEOUT_MS;
  return new Promise((resolvePromise, rejectPromise) => {
    let url: URL;
    try {
      url = assertFetchableUrl(urlString, extraHosts);
    } catch (error) {
      rejectPromise(error);
      return;
    }
    const runLookup = allowPrivate
      ? Promise.resolve()
      : assertPublicHost(url.hostname);
    runLookup.then(
      () => {
        const transport = url.protocol === 'https:' ? httpsGet : httpGet;
        const request = transport(
          {
            hostname: url.hostname,
            port: url.port ? Number(url.port) : undefined,
            path: `${url.pathname}${url.search}`,
            method: 'HEAD',
            headers: { 'User-Agent': 'Sabz-System-Media-Importer/1.0' },
            timeout: timeoutMs,
            ...(allowPrivate ? {} : { lookup: pinnedLookup() }),
          },
          (response) => {
            const status = response.statusCode ?? 0;
            const lengthRaw = response.headers['content-length'];
            const length = Array.isArray(lengthRaw)
              ? Number(lengthRaw[0])
              : Number(lengthRaw);
            response.resume();
            const contentType = response.headers['content-type'] ?? null;
            resolvePromise({
              url: urlString,
              status,
              location: response.headers.location ?? null,
              contentType: Array.isArray(contentType) ? contentType[0] ?? null : contentType,
              contentLength: Number.isFinite(length) ? length : null,
            });
          },
        );
        request.on('timeout', () => {
          request.destroy(
            new MediaFetchError('اتصال به آدرس تصویر ناموفق بود (مهلت تمام شد).', true),
          );
        });
        request.on('error', (error) => {
          rejectPromise(
            error instanceof BadRequestException || error instanceof MediaFetchError
              ? error
              : new MediaFetchError(
                  error instanceof Error ? error.message : 'خطای شبکه در بررسی آدرس تصویر.',
                  true,
                ),
          );
        });
      },
      (error) => rejectPromise(error),
    );
  });
}
