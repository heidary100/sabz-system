import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HomepageActivationService,
  HOMEPAGE_ACTIVATION_DEFAULT_BATCH_SIZE,
} from './homepage-activation.service';

const DEFAULT_INTERVAL_MS = 20_000;
const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 3_600_000;
const MAX_BATCH_SIZE = 100;

/**
 * Small in-process worker for scheduled homepage activation (Task 05.6).
 *
 * There is no scheduler library in this repository. A self-rescheduling timeout
 * avoids overlapping local ticks; PostgreSQL advisory locks provide
 * cross-instance serialization. The worker is disabled by default under
 * NODE_ENV=test unless explicitly enabled, so deterministic tests can invoke
 * HomepageActivationService directly.
 */
@Injectable()
export class HomepageActivationWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(HomepageActivationWorker.name);
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly config: ConfigService,
    private readonly activation: HomepageActivationService,
  ) {
    this.enabled = resolveEnabled(config);
    this.intervalMs = boundedNumber(
      config.get<string>('HOMEPAGE_ACTIVATION_INTERVAL_MS'),
      DEFAULT_INTERVAL_MS,
      MIN_INTERVAL_MS,
      MAX_INTERVAL_MS,
    );
    this.batchSize = boundedNumber(
      config.get<string>('HOMEPAGE_ACTIVATION_BATCH_SIZE'),
      HOMEPAGE_ACTIVATION_DEFAULT_BATCH_SIZE,
      1,
      MAX_BATCH_SIZE,
    );
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('Scheduled homepage activation worker is disabled.');
      return;
    }
    this.logger.log(
      `Scheduled homepage activation worker started (interval=${this.intervalMs}ms, batch=${this.batchSize}).`,
    );
    this.scheduleNext(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight !== null) {
      await this.inFlight.catch(() => undefined);
    }
    if (this.enabled) {
      this.logger.log('Scheduled homepage activation worker stopped.');
    }
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.inFlight = this.tick();
      void this.inFlight.finally(() => {
        this.inFlight = null;
        if (!this.stopped) this.scheduleNext(this.intervalMs);
      });
    }, delayMs);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    try {
      const result = await this.activation.runDue(new Date(), this.batchSize);
      if (result.due > 0 || result.failed > 0) {
        this.logger.log(
          `Homepage activation tick due=${result.due} activated=${result.activated} blocked=${result.blocked} skipped=${result.skipped} failed=${result.failed} hasMore=${result.hasMore}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Homepage activation tick failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function resolveEnabled(config: ConfigService): boolean {
  const raw = config.get<string>('HOMEPAGE_ACTIVATION_ENABLED');
  if (raw === undefined || raw.trim() === '') {
    return config.get<string>('NODE_ENV') !== 'test';
  }
  return !['false', '0', 'off', 'no'].includes(raw.trim().toLowerCase());
}

function boundedNumber(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
