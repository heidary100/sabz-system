import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
import { NotificationService } from './notification.service';

function makePrisma() {
  return {
    $transaction: jest.fn((ops: Array<Promise<unknown>>) =>
      Promise.all(ops),
    ),
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  smsEnabled = false,
): NotificationService {
  const config = {
    get: jest.fn().mockReturnValue(smsEnabled ? 'true' : undefined),
  } as unknown as ConfigService;
  return new NotificationService(
    prisma as unknown as PrismaService,
    config,
  );
}

const ROW = {
  id: 'notif-1',
  userId: 'user-1',
  type: 'ORDER_PLACED',
  title: 'سفارش شما ثبت شد',
  body: 'سفارش 100001 با موفقیت ثبت شد.',
  entity: 'Order',
  entityId: 'order-1',
  readAt: null,
  createdAt: new Date('2026-09-30T10:00:00.000Z'),
};

describe('NotificationService (SS-243)', () => {
  describe('notify', () => {
    it('persists the row and stays silent on SMS when disabled', async () => {
      const prisma = makePrisma();
      prisma.notification.create.mockResolvedValue({ id: 'notif-1' });
      const service = makeService(prisma, false);

      await service.notify('user-1', {
        type: 'ORDER_PLACED',
        title: 't',
        body: 'b',
        entity: 'Order',
        entityId: 'order-1',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: 'ORDER_PLACED',
          title: 't',
          body: 'b',
          entity: 'Order',
          entityId: 'order-1',
        },
        select: { id: true },
      });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('never rejects when the insert fails', async () => {
      const prisma = makePrisma();
      prisma.notification.create.mockRejectedValue(new Error('db down'));
      const service = makeService(prisma, false);

      await expect(
        service.notify('user-1', {
          type: 'ORDER_PLACED',
          title: 't',
          body: 'b',
        }),
      ).resolves.toBeUndefined();
    });

    it('resolves the mobile for the SMS stub when enabled', async () => {
      const prisma = makePrisma();
      prisma.notification.create.mockResolvedValue({ id: 'notif-1' });
      prisma.user.findUnique.mockResolvedValue({ mobile: '+989121234567' });
      const service = makeService(prisma, true);

      await service.notify('user-1', {
        type: 'ORDER_PLACED',
        title: 't',
        body: 'b',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { mobile: true },
      });
    });
  });

  describe('notifyOperators', () => {
    it('fans out one row per OPERATOR/ADMIN user', async () => {
      const prisma = makePrisma();
      prisma.user.findMany.mockResolvedValue([{ id: 'op-1' }, { id: 'op-2' }]);
      prisma.notification.createMany.mockResolvedValue({ count: 2 });
      const service = makeService(prisma, false);

      await service.notifyOperators({
        type: 'ORDER_PLACED',
        title: 'سفارش جدید',
        body: 'سفارش 100001 ثبت شد.',
        entity: 'Order',
        entityId: 'order-1',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          roles: { some: { role: { name: { in: ['OPERATOR', 'ADMIN'] } } } },
        },
        select: { id: true },
      });
      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'op-1',
            type: 'ORDER_PLACED',
            title: 'سفارش جدید',
            body: 'سفارش 100001 ثبت شد.',
            entity: 'Order',
            entityId: 'order-1',
          },
          {
            userId: 'op-2',
            type: 'ORDER_PLACED',
            title: 'سفارش جدید',
            body: 'سفارش 100001 ثبت شد.',
            entity: 'Order',
            entityId: 'order-1',
          },
        ],
      });
    });

    it('no-ops when no staff users exist and never rejects on failure', async () => {
      const prisma = makePrisma();
      prisma.user.findMany.mockResolvedValue([]);
      const service = makeService(prisma, false);

      await service.notifyOperators({
        type: 'RFQ_CREATED',
        title: 't',
        body: 'b',
      });
      expect(prisma.notification.createMany).not.toHaveBeenCalled();

      prisma.user.findMany.mockRejectedValue(new Error('db down'));
      await expect(
        service.notifyOperators({ type: 'RFQ_CREATED', title: 't', body: 'b' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('reads', () => {
    it('lists newest-first with pagination and type labels', async () => {
      const prisma = makePrisma();
      prisma.notification.count.mockResolvedValue(1);
      prisma.notification.findMany.mockResolvedValue([ROW]);
      const service = makeService(prisma, false);

      const result = await service.list('user-1', { page: 1, limit: 20 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        items: [
          {
            id: 'notif-1',
            type: 'ORDER_PLACED',
            typeFa: 'ثبت سفارش',
            title: 'سفارش شما ثبت شد',
            body: 'سفارش 100001 با موفقیت ثبت شد.',
            entity: 'Order',
            entityId: 'order-1',
            readAt: null,
            createdAt: '2026-09-30T10:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('filters unread-only and counts unread', async () => {
      const prisma = makePrisma();
      prisma.notification.count.mockResolvedValue(2);
      prisma.notification.findMany.mockResolvedValue([]);
      const service = makeService(prisma, false);

      await service.list('user-1', { unreadOnly: true });
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', readAt: null },
        }),
      );

      prisma.notification.count.mockResolvedValue(2);
      await expect(service.unreadCount('user-1')).resolves.toEqual({
        unread: 2,
      });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
      });
    });
  });

  describe('markRead', () => {
    it('marks an owned unread row and re-reads idempotently', async () => {
      const prisma = makePrisma();
      prisma.notification.findUnique.mockResolvedValue(ROW);
      prisma.notification.update.mockResolvedValue({
        ...ROW,
        readAt: new Date('2026-09-30T11:00:00.000Z'),
      });
      const service = makeService(prisma, false);

      const first = await service.markRead('user-1', 'notif-1');
      expect(first.readAt).toBe('2026-09-30T11:00:00.000Z');

      prisma.notification.findUnique.mockResolvedValue({
        ...ROW,
        readAt: new Date('2026-09-30T11:00:00.000Z'),
      });
      const second = await service.markRead('user-1', 'notif-1');
      expect(second.readAt).toBe('2026-09-30T11:00:00.000Z');
      expect(prisma.notification.update).toHaveBeenCalledTimes(1);
    });

    it('404s missing and other-user rows (non-disclosure)', async () => {
      const prisma = makePrisma();
      prisma.notification.findUnique.mockResolvedValue(null);
      const service = makeService(prisma, false);

      await expect(service.markRead('user-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );

      prisma.notification.findUnique.mockResolvedValue({
        ...ROW,
        userId: 'user-2',
      });
      await expect(service.markRead('user-1', 'notif-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });
});
