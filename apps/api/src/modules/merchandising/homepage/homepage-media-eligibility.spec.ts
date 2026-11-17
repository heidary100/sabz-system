import { Prisma } from '@prisma/client';
import type { HomepageSnapshot } from '@sabz/types';
import { reconcilePublishedMediaEligibility } from './homepage-media-eligibility';

function section(key: string, isVisible: boolean, mediaIds: string[]): Record<string, unknown> {
  return {
    key,
    type: 'HERO_CAROUSEL',
    order: 0,
    isVisible,
    settings: {
      campaigns: [
        {
          sourceCampaignId: 'campaign-1',
          media: mediaIds.map((mediaId, index) => ({
            mediaId,
            slot: index === 0 ? 'HERO_DESKTOP' : 'BANNER',
            sortOrder: index,
          })),
        },
      ],
    },
  };
}

function tx() {
  return {
    merchMedia: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as Prisma.TransactionClient & {
    merchMedia: { updateMany: jest.Mock };
  };
}

describe('reconcilePublishedMediaEligibility', () => {
  it('publishes visible-only and shared media, and clears hidden-only media', async () => {
    const client = tx();
    const snapshot = {
      schemaVersion: 1,
      sections: [
        section('visible', true, ['visible-only', 'shared']),
        section('hidden', false, ['hidden-only', 'shared']),
      ],
    } as unknown as HomepageSnapshot;

    await reconcilePublishedMediaEligibility(
      client,
      snapshot,
      new Date('2026-11-10T12:00:00.000Z'),
      'operator-1',
    );

    expect(client.merchMedia.updateMany).toHaveBeenCalledTimes(2);
    const first = client.merchMedia.updateMany.mock.calls[0]![0] as {
      where: { id: { in: string[] } };
    };
    expect([...first.where.id.in].sort()).toEqual(['shared', 'visible-only']);

    const second = client.merchMedia.updateMany.mock.calls[1]![0] as {
      where: { id: { notIn: string[] } };
    };
    expect([...second.where.id.notIn].sort()).toEqual(['shared', 'visible-only']);
  });

  it('clears all previously published media when no visible section references any', async () => {
    const client = tx();
    const snapshot = {
      schemaVersion: 1,
      sections: [section('hidden', false, ['hidden-only'])],
    } as unknown as HomepageSnapshot;

    await reconcilePublishedMediaEligibility(
      client,
      snapshot,
      new Date('2026-11-10T12:00:00.000Z'),
      'operator-1',
    );

    expect(client.merchMedia.updateMany).toHaveBeenCalledTimes(1);
    const clear = client.merchMedia.updateMany.mock.calls[0]![0] as {
      where: { id?: unknown };
    };
    expect(clear.where.id).toBeUndefined();
  });
});
