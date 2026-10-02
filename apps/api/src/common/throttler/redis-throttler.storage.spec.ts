import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  const makeRedis = (evalImpl: jest.Mock) =>
    ({ eval: evalImpl }) as unknown as ConstructorParameters<
      typeof RedisThrottlerStorage
    >[0];

  it('maps the Lua record to throttler seconds-scale expiries', async () => {
    const evalMock = jest.fn().mockResolvedValue([3, 60_000, 0, 0]);
    const storage = new RedisThrottlerStorage(makeRedis(evalMock));

    const record = await storage.increment('key', 60_000, 100, 60_000, 'default');

    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(evalMock).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'throttle:key:default',
      'throttle:key:default:blocked',
      '60000',
      '100',
      '60000',
    );
  });

  it('reports blocked hits with the block expiry', async () => {
    const evalMock = jest.fn().mockResolvedValue([101, 45_000, 1, 30_000]);
    const storage = new RedisThrottlerStorage(makeRedis(evalMock));

    const record = await storage.increment('key', 60_000, 100, 30_000, 'default');

    expect(record.isBlocked).toBe(true);
    expect(record.totalHits).toBe(101);
    expect(record.timeToBlockExpire).toBe(30);
  });

  it('fails open (allow) when Redis rejects', async () => {
    const evalMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const storage = new RedisThrottlerStorage(makeRedis(evalMock));

    const record = await storage.increment('key', 60_000, 100, 60_000, 'default');

    expect(record).toEqual({
      totalHits: 0,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });
});
