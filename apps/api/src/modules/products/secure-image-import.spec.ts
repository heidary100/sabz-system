import { BadRequestException } from '@nestjs/common';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { createServer } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  downloadImageToTemp,
  isBlockedIp,
} from './secure-image-import';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

async function withServer(
  handler: RequestHandler,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolvePromise) =>
    server.listen(0, '127.0.0.1', resolvePromise),
  );
  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise((resolvePromise) => server.close(resolvePromise));
    throw new Error('no port');
  }
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

describe('secure image import (SSRF protection)', () => {
  describe('isBlockedIp', () => {
    it('blocks private and reserved IPv4 ranges', () => {
      for (const ip of [
        '127.0.0.1',
        '10.0.0.1',
        '192.168.1.1',
        '172.16.0.1',
        '172.31.255.255',
        '169.254.1.1',
        '100.64.0.1',
        '0.0.0.0',
        '224.0.0.1',
        '240.0.0.1',
        '255.255.255.255',
      ]) {
        expect(isBlockedIp(ip)).toBe(true);
      }
    });

    it('allows public IPv4 addresses', () => {
      for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34']) {
        expect(isBlockedIp(ip)).toBe(false);
      }
    });

    it('blocks loopback/ULA/link-local/multicast IPv6', () => {
      for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2001:db8::1']) {
        expect(isBlockedIp(ip)).toBe(true);
      }
    });

    it('blocks IPv4-mapped, 6to4 and Teredo encodings of private IPv4', () => {
      for (const ip of [
        '::ffff:127.0.0.1',
        '::ffff:10.0.0.1',
        '::ffff:192.168.1.1',
        '::ffff:7f00:1',
        '::10.0.0.1',
        '2002:7f00:1::',
        '2002:0a00:1::',
        '2001:0:4136:e378::1',
      ]) {
        expect(isBlockedIp(ip)).toBe(true);
      }
    });

    it('allows IPv4-mapped encodings of public IPv4', () => {
      expect(isBlockedIp('::ffff:8.8.8.8')).toBe(false);
      expect(isBlockedIp('::ffff:0808:0808')).toBe(false);
    });

    it('allows public IPv6 addresses', () => {
      expect(isBlockedIp('2606:4700:4700::1111')).toBe(false);
    });

    it('blocks non-parseable values', () => {
      expect(isBlockedIp('not-an-ip')).toBe(true);
    });
  });

  describe('downloadImageToTemp', () => {
    it('downloads an image and follows redirects', async () => {
      await withServer(
        (req, res) => {
          if (req.url === '/final.jpg') {
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            res.end(JPEG_BYTES);
            return;
          }
          res.writeHead(302, { Location: '/final.jpg' });
          res.end();
        },
        async (base) => {
          const dir = await mkdtemp(join(tmpdir(), 'sabz-import-'));
          try {
            const result = await downloadImageToTemp(
              `${base}/start`,
              true,
            );
            const bytes = await readFile(result.filePath);
            expect(bytes.equals(JPEG_BYTES)).toBe(true);
          } finally {
            await rm(dir, { recursive: true, force: true });
          }
        },
      );
    });

    it('rejects a blocked (private) host by default', async () => {
      await withServer(
        (req, res) => {
          res.writeHead(200, { 'Content-Type': 'image/jpeg' });
          res.end(JPEG_BYTES);
        },
        async (base) => {
          await expect(
            downloadImageToTemp(`${base}/x.jpg`, false),
          ).rejects.toBeInstanceOf(BadRequestException);
        },
      );
    });

    it('rejects non-http(s) schemes', async () => {
      await expect(
        downloadImageToTemp('javascript:alert(1)', true),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        downloadImageToTemp('file:///etc/passwd', true),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        downloadImageToTemp('data:image/png;base64,AAAA', true),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-2xx responses', async () => {
      await withServer(
        (_req, res) => {
          res.writeHead(404);
          res.end();
        },
        async (base) => {
          await expect(
            downloadImageToTemp(`${base}/missing.jpg`, true),
          ).rejects.toBeInstanceOf(BadRequestException);
        },
      );
    });

    it('rejects oversized responses', async () => {
    // Serve ~6 MB (cap is 5 MB).
    const bigChunk = Buffer.concat([
      Buffer.alloc(1024 * 1024, 7),
      Buffer.alloc(1024 * 1024, 7),
      Buffer.alloc(1024 * 1024, 7),
      Buffer.alloc(1024 * 1024, 7),
      Buffer.alloc(1024 * 1024, 7),
      Buffer.alloc(1024 * 1024, 7),
    ]);
    await withServer(
      (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(bigChunk);
      },
      async (base) => {
        await expect(
          downloadImageToTemp(`${base}/big.jpg`, true),
        ).rejects.toBeInstanceOf(BadRequestException);
      },
    );
  });
  });
});