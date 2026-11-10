import { ConfigService } from '@nestjs/config';
import { HomepageActivationService } from './homepage-activation.service';
import { HomepageActivationWorker } from './homepage-activation.worker';

function config(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const emptyRun = {
  due: 0,
  activated: 0,
  blocked: 0,
  skipped: 0,
  failed: 0,
  hasMore: false,
};

describe('HomepageActivationWorker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is disabled by default under NODE_ENV=test', async () => {
    const runDue = jest.fn().mockResolvedValue(emptyRun);
    const worker = new HomepageActivationWorker(
      config({ NODE_ENV: 'test' }),
      { runDue } as unknown as HomepageActivationService,
    );
    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(runDue).not.toHaveBeenCalled();
    await worker.onApplicationShutdown();
  });

  it('runs with configured interval and batch size without local overlap', async () => {
    let resolveRun: ((value: typeof emptyRun) => void) | null = null;
    const firstRun = new Promise<typeof emptyRun>((resolve) => {
      resolveRun = resolve;
    });
    const runDue = jest
      .fn()
      .mockReturnValueOnce(firstRun)
      .mockResolvedValue(emptyRun);
    const worker = new HomepageActivationWorker(
      config({
        NODE_ENV: 'test',
        HOMEPAGE_ACTIVATION_ENABLED: 'true',
        HOMEPAGE_ACTIVATION_INTERVAL_MS: '5000',
        HOMEPAGE_ACTIVATION_BATCH_SIZE: '3',
      }),
      { runDue } as unknown as HomepageActivationService,
    );

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(runDue).toHaveBeenCalledTimes(1);
    expect(runDue.mock.calls[0]![1]).toBe(3);

    // The next tick is only scheduled after the in-flight run settles.
    await jest.advanceTimersByTimeAsync(30_000);
    expect(runDue).toHaveBeenCalledTimes(1);

    resolveRun!(emptyRun);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5000);
    expect(runDue).toHaveBeenCalledTimes(2);

    await worker.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(runDue).toHaveBeenCalledTimes(2);
  });

  it('waits for an in-flight tick during graceful shutdown', async () => {
    let resolveRun: ((value: typeof emptyRun) => void) | null = null;
    const runDue = jest.fn().mockReturnValue(
      new Promise<typeof emptyRun>((resolve) => {
        resolveRun = resolve;
      }),
    );
    const worker = new HomepageActivationWorker(
      config({
        NODE_ENV: 'test',
        HOMEPAGE_ACTIVATION_ENABLED: 'true',
        HOMEPAGE_ACTIVATION_INTERVAL_MS: '20000',
      }),
      { runDue } as unknown as HomepageActivationService,
    );
    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(runDue).toHaveBeenCalledTimes(1);

    let stopped = false;
    const shutdown = worker.onApplicationShutdown().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    resolveRun!(emptyRun);
    await shutdown;
    expect(stopped).toBe(true);
  });
});
