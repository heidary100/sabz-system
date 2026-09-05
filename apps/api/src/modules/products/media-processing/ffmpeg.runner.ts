import { Logger } from '@nestjs/common';
import { spawn } from 'child_process';

export interface FfmpegRunOptions {
  /** Millisecond timeout; kills the process when exceeded. */
  timeoutMs?: number;
}

/** Raised when the configured FFmpeg binary is not available or fails. */
export class FfmpegError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly timedOut: boolean,
  ) {
    super(message);
    this.name = 'FfmpegError';
  }
}

/**
 * Thin wrapper around the FFmpeg CLI used by the video watermark processor.
 *
 * Safety rules:
 *   - Commands are always built as an argument array and passed to
 *     `child_process.spawn` with `shell: false` — never a shell string — so
 *     user-controlled values can never reach a shell.
 *   - FFmpeg arguments reference only server-generated temp paths and fixed
 *     filter strings; client filenames are never used as arguments.
 *   - stderr is collected only for internal logging (truncated) and never
 *     surfaced to API clients; failures map to a sanitized error.
 */
export class FfmpegRunner {
  private readonly logger = new Logger(FfmpegRunner.name);
  private readonly binary: string;

  constructor(binary: string) {
    this.binary = binary;
  }

  /** Resolves the FFmpeg binary path (env override or `ffmpeg` on PATH). */
  static resolveBinary(): string {
    const env = process.env.FFMPEG_PATH;
    return env && env.trim() !== '' ? env : 'ffmpeg';
  }

  /** Whether the FFmpeg binary responds, e.g. for startup/CI checks. */
  async isAvailable(): Promise<boolean> {
    try {
      await this.run(['-version'], { timeoutMs: 15_000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Runs FFmpeg with the given arguments and rejects with a sanitized
   * `FfmpegError` when the process exits non-zero or times out.
   */
  async run(args: string[], options: FfmpegRunOptions = {}): Promise<void> {
    const { timeoutMs = 10 * 60 * 1000 } = options;

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(this.binary, args, {
        shell: false,
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      });

      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length < 8_192) {
          stderr += chunk.toString('utf8');
        }
      });

      const killTimer = setTimeout(() => {
        child.kill('SIGKILL');
        rejectPromise(
          new FfmpegError('FFmpeg processing timed out.', null, true),
        );
      }, timeoutMs);

      child.on('error', (error) => {
        clearTimeout(killTimer);
        const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
        rejectPromise(
          missing
            ? new FfmpegError('FFmpeg binary is not available.', null, false)
            : new FfmpegError(`FFmpeg failed to start: ${error.message}`, null, false),
        );
      });

      child.on('close', (code) => {
        clearTimeout(killTimer);
        if (code === 0) {
          resolvePromise();
          return;
        }
        this.logger.error(
          `FFmpeg exited with code ${code}: ${stderr.trim().slice(0, 1_500)}`,
        );
        rejectPromise(new FfmpegError('FFmpeg processing failed.', code, false));
      });
    });
  }
}