import {
  HOMEPAGE_ACTIVATION_SYSTEM_ACTOR,
  HomepageActivationService,
} from './homepage-activation.service';

describe('HomepageActivationService failure audit', () => {
  it('persists a system-attributed failure audit outside the failed transaction', async () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      $transaction: jest.fn().mockRejectedValueOnce(new Error('activation failed')),
      homepagePublication: {
        findUnique: jest.fn().mockResolvedValue({
          version: 7,
          publishAt: now,
          status: 'SCHEDULED',
        }),
      },
    };
    const service = new HomepageActivationService(
      prisma as never,
      audit as never,
      {} as never,
    );

    await expect(service.activateById('publication-1', { now })).rejects.toThrow(
      'activation failed',
    );

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: HOMEPAGE_ACTIVATION_SYSTEM_ACTOR,
        action: 'HOMEPAGE_SCHEDULED_ACTIVATION_FAILED',
        entityId: 'publication-1',
        after: expect.objectContaining({
          version: 7,
          status: 'SCHEDULED',
          errorCode: 'Error',
        }),
      }),
    );
  });
});
