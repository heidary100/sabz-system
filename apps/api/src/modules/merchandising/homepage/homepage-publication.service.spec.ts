import { HomepagePublicationService } from './homepage-publication.service';

describe('HomepagePublicationService failure audit boundary', () => {
  const actorId = 'admin-user-1';
  let transaction: jest.Mock;
  let audit: { log: jest.Mock };
  let service: HomepagePublicationService;

  beforeEach(() => {
    transaction = jest.fn();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new HomepagePublicationService(
      { $transaction: transaction } as never,
      audit as never,
      {} as never,
      {} as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['HOMEPAGE_PUBLICATION_FAILED', () => service.publish(actorId, {}), 'homepage'],
    ['HOMEPAGE_SCHEDULE_CANCEL_FAILED', () => service.cancel('publication-1', actorId), 'publication-1'],
    ['HOMEPAGE_ROLLBACK_FAILED', () => service.rollback('publication-1', actorId, {}), 'publication-1'],
  ])(
    'writes %s when the mutation transaction fails',
    async (action, operation, entityId) => {
      transaction.mockRejectedValueOnce(new Error('transaction failed'));

      await expect(operation()).rejects.toThrow('transaction failed');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: actorId,
          action,
          entityId,
        }),
      );
    },
  );

  it.each([
    ['HOMEPAGE_PUBLICATION_FAILED', () => service.publish(actorId, {})],
    [
      'HOMEPAGE_SCHEDULE_CANCEL_FAILED',
      () => service.cancel('publication-1', actorId),
    ],
    [
      'HOMEPAGE_ROLLBACK_FAILED',
      () => service.rollback('publication-1', actorId, {}),
    ],
  ])(
    'does not write %s when the commit succeeds but response hydration fails',
    async (action, operation) => {
      transaction.mockResolvedValueOnce('publication-1');
      jest
        .spyOn(service, 'getDetail')
        .mockRejectedValueOnce(new Error('detail read failed'));

      await expect(operation()).rejects.toThrow('detail read failed');
      expect(audit.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action }),
      );
    },
  );
});
