import { open } from 'fs/promises';

/**
 * Reads the leading `length` bytes of a file without loading the whole file
 * into memory. Used by the media pipeline for magic-byte validation of large
 * uploads (e.g. 200 MB videos) that are streamed to disk.
 */
export async function readFileHeader(path: string, length: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}