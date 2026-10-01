import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ReturnStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { ReturnsService } from './returns.service';

const USER_ID = 'user-1';
const OPERATOR_ID = 'operator-1';
const ORDER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const RETURN_ID = '7fa85f64-5717-4562-b3fc-2c963f66afa6';
const ORDER_ITEM_ID = '8fa85f64-5717-4562-b3fc-2c963f66afa6';

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    userId: USER_ID,
    orderNumber: 100001,
    status: 'DELIVERED',
    updatedAt: new Date(),
    items: [
      {
        id: ORDER_ITEM_ID,
        variantId: 'variant-1',
        productName: 'گوشی',
        variantName: null,
        sku: 'SKU-1',
        quantity: 2,
      },
    ],
    ...overrides,
  };
}

function returnRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RETURN_ID,
    orderId: ORDER_ID,
    status: ReturnStatus.PENDING,
    reason: 'معیوب است.',
    rejectReason: null,
    receivedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-09-30T00:00:00.000Z'),
    updatedAt: new Date('2026-09-30T00:00:00.000Z'),
    order: { orderNumber: 100001 },
    items: [
      {
        id: 'item-1',
        orderItemId: ORDER_ITEM_ID,
        variantId: 'variant-1',
        productName: 'گوشی',
        variantName: null,
        sku: 'SKU-1',
        quantity: 1,
      },
    ],
    ...overrides,
  };
}

function adminRow(overrides: Record<string, unknown> = {}) {
  return {
    ...returnRow(),
    userId: USER_ID,
    user: { mobile: '+989170000001' },
    ...overrides,
  };
}

describe('ReturnsService (SS-242)', () => {
  let service: ReturnsService;
  let prisma: {
    order: { findUnique: jest.Mock };
    returnRequest: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };

  beforeEach(() => {
    prisma = {
      order: { findUnique: jest.fn() },
      returnRequest: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };
    service = new ReturnsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      {
        notify: jest.fn(),
        notifyOperators: jest.fn(),
      } as unknown as NotificationService,
    );
  });

  describe('create', () => {
    const dto = {
      orderId: ORDER_ID,
      reason: 'معیوب است.',
      items: [{ orderItemId: ORDER_ITEM_ID, quantity: 1 }],
    };

    it('files a PENDING request for an owned DELIVERED order with an audit event', async () => {
      prisma.order.findUnique.mockResolvedValue(orderRow());
      prisma.returnRequest.findFirst.mockResolvedValue(null);
      prisma.returnRequest.create.mockResolvedValue(returnRow());

      const result = await service.create(USER_ID, dto, '1.2.3.4');

      expect(result.status).toBe('PENDING');
      expect(result.statusFa).toBe('در انتظار بررسی');
      expect(result.orderNumber).toBe(100001);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RETURN_REQUESTED',
          entity: 'ReturnRequest',
        }),
      );
    });

    it('404s for unknown or other-user orders', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.create(USER_ID, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      prisma.order.findUnique.mockResolvedValue(
        orderRow({ userId: 'other' }),
      );
      await expect(service.create(USER_ID, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('422s for non-DELIVERED orders', async () => {
      prisma.order.findUnique.mockResolvedValue(orderRow({ status: 'SHIPPED' }));
      await expect(service.create(USER_ID, dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('422s outside the return window', async () => {
      prisma.order.findUnique.mockResolvedValue(
        orderRow({ updatedAt: new Date('2026-01-01T00:00:00.000Z') }),
      );
      await expect(service.create(USER_ID, dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('422s for unknown items and over-quantity lines', async () => {
      prisma.order.findUnique.mockResolvedValue(orderRow());
      await expect(
        service.create(USER_ID, {
          ...dto,
          items: [{ orderItemId: 'nope', quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      await expect(
        service.create(USER_ID, {
          ...dto,
          items: [{ orderItemId: ORDER_ITEM_ID, quantity: 99 }],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('409s while an open request exists', async () => {
      prisma.order.findUnique.mockResolvedValue(orderRow());
      prisma.returnRequest.findFirst.mockResolvedValue({ id: RETURN_ID });
      await expect(service.create(USER_ID, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('owner reads + cancel', () => {
    it('lists newest-first with pagination passthrough', async () => {
      prisma.$transaction.mockResolvedValue([1, [returnRow()]]);
      const result = await service.list(USER_ID, { page: 2, limit: 10 });
      expect(result).toMatchObject({ total: 1, page: 2, limit: 10 });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('cancels a PENDING request with an audit event', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: RETURN_ID,
        userId: USER_ID,
        status: ReturnStatus.PENDING,
      });
      prisma.returnRequest.update.mockResolvedValue(
        returnRow({ status: ReturnStatus.CANCELLED }),
      );

      const result = await service.cancel(USER_ID, RETURN_ID);
      expect(result.status).toBe('CANCELLED');
      expect(result.statusFa).toBe('لغو شد');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RETURN_CANCELLED' }),
      );
    });

    it('409s cancelling a non-PENDING request', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: RETURN_ID,
        userId: USER_ID,
        status: ReturnStatus.APPROVED,
      });
      await expect(service.cancel(USER_ID, RETURN_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('operator transitions', () => {
    it('defaults the admin queue to PENDING with limit 20', async () => {
      prisma.$transaction.mockResolvedValue([0, []]);
      const result = await service.listForAdmin({});
      expect(result).toMatchObject({ total: 0, page: 1, limit: 20 });
      expect(prisma.returnRequest.count).toHaveBeenCalledWith({
        where: { status: 'PENDING' },
      });
    });

    it('walks the full lifecycle with audits', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: RETURN_ID,
        status: ReturnStatus.PENDING,
      });
      prisma.returnRequest.update.mockResolvedValue(
        adminRow({ status: ReturnStatus.APPROVED }),
      );
      const approved = await service.approve(OPERATOR_ID, RETURN_ID);
      expect(approved.status).toBe('APPROVED');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RETURN_APPROVED' }),
      );

      prisma.returnRequest.findUnique.mockResolvedValue({
        id: RETURN_ID,
        status: ReturnStatus.APPROVED,
      });
      prisma.returnRequest.update.mockResolvedValue(
        adminRow({ status: ReturnStatus.RECEIVED }),
      );
      const received = await service.receive(OPERATOR_ID, RETURN_ID);
      expect(received.status).toBe('RECEIVED');

      prisma.returnRequest.findUnique.mockResolvedValue({
        id: RETURN_ID,
        status: ReturnStatus.RECEIVED,
      });
      prisma.returnRequest.update.mockResolvedValue(
        adminRow({ status: ReturnStatus.COMPLETED }),
      );
      const completed = await service.complete(OPERATOR_ID, RETURN_ID);
      expect(completed.status).toBe('COMPLETED');
      expect(completed.customerMobile).toBe('+989170000001');
    });

    it('rejects with a reason and 409s illegal transitions', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: RETURN_ID,
        status: ReturnStatus.PENDING,
      });
      prisma.returnRequest.update.mockResolvedValue(
        adminRow({ status: ReturnStatus.REJECTED }),
      );
      const rejected = await service.reject(
        OPERATOR_ID,
        RETURN_ID,
        'مهلت تمام شد.',
      );
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.statusFa).toBe('رد شد');

      prisma.returnRequest.findUnique.mockResolvedValue({
        id: RETURN_ID,
        status: ReturnStatus.REJECTED,
      });
      await expect(
        service.approve(OPERATOR_ID, RETURN_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
