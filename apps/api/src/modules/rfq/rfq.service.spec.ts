import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, RfqStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CheckoutService } from '../orders/checkout.service';
import { RfqService } from './rfq.service';

const D = (v: string | number) => new Prisma.Decimal(v);

const USER_ID = 'user-1';
const OPERATOR_ID = 'operator-1';
const RFQ_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const VARIANT_ID = '7fa85f64-5717-4562-b3fc-2c963f66afa6';

function quotableVariant() {
  return { id: VARIANT_ID, priceStatus: 'CALL_FOR_PRICE' };
}

function rfqRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RFQ_ID,
    userId: USER_ID,
    variantId: VARIANT_ID,
    quantity: 5,
    status: RfqStatus.PENDING,
    quotedUnitPrice: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    orderId: null,
    createdAt: new Date('2026-09-28T00:00:00.000Z'),
    variant: {
      sku: 'SKU-CFP',
      product: { slug: 'call-for-price-phone', name: 'گوشی بدون قیمت' },
    },
    ...overrides,
  };
}

describe('RfqService (SS-235 B2)', () => {
  let service: RfqService;
  let prisma: {
    partner: { findFirst: jest.Mock };
    productVariant: { findFirst: jest.Mock };
    rfq: {
      create: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    userRole: { count: jest.Mock };
    order: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let checkout: { placeQuotedOrder: jest.Mock };
  let audit: { log: jest.Mock };

  beforeEach(() => {
    prisma = {
      partner: { findFirst: jest.fn() },
      productVariant: { findFirst: jest.fn() },
      rfq: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      userRole: { count: jest.fn() },
      order: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    checkout = { placeQuotedOrder: jest.fn() };
    audit = { log: jest.fn() };
    service = new RfqService(
      prisma as unknown as PrismaService,
      checkout as unknown as CheckoutService,
      audit as unknown as AuditService,
    );
  });

  describe('create', () => {
    it('rejects guests of the partner program with 403', async () => {
      prisma.partner.findFirst.mockResolvedValue(null);

      await expect(
        service.create(USER_ID, { variantId: VARIANT_ID, quantity: 5 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.rfq.create).not.toHaveBeenCalled();
    });

    it('rejects PRICED variants with 422 (RFQ is call-for-price only)', async () => {
      prisma.partner.findFirst.mockResolvedValue({ id: 'partner-1' });
      prisma.productVariant.findFirst.mockResolvedValue({
        id: VARIANT_ID,
        priceStatus: 'PRICED',
      });

      await expect(
        service.create(USER_ID, { variantId: VARIANT_ID, quantity: 5 }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('creates a PENDING RFQ with a 7-day window and audits creation', async () => {
      prisma.partner.findFirst.mockResolvedValue({ id: 'partner-1' });
      prisma.productVariant.findFirst.mockResolvedValue(quotableVariant());
      const row = rfqRow();
      prisma.rfq.create.mockResolvedValue(row);

      const dto = await service.create(
        USER_ID,
        { variantId: VARIANT_ID, quantity: 5 },
        '127.0.0.1',
      );

      expect(dto.status).toBe('PENDING');
      expect(dto.statusFa).toBe('در انتظار استعلام');
      expect(dto.quotedUnitPrice).toBeNull();
      expect(dto.orderId).toBeNull();
      const createData = prisma.rfq.create.mock.calls[0][0].data;
      const windowMs =
        createData.expiresAt.getTime() - Date.now();
      expect(windowMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
      expect(windowMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RFQ_CREATED',
          entity: 'Rfq',
          entityId: RFQ_ID,
        }),
      );
    });
  });

  describe('quote', () => {
    it('rejects quoting a non-pending row with 409', async () => {
      prisma.rfq.findUnique.mockResolvedValue(
        rfqRow({ status: RfqStatus.QUOTED, quotedUnitPrice: D(1000) }),
      );

      await expect(
        service.quote(OPERATOR_ID, RFQ_ID, { unitPrice: '900' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a non-positive quoted price with 400', async () => {
      prisma.rfq.findUnique.mockResolvedValue(rfqRow());

      await expect(
        service.quote(OPERATOR_ID, RFQ_ID, { unitPrice: '0' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a past expiry override with 400', async () => {
      prisma.rfq.findUnique.mockResolvedValue(rfqRow());

      await expect(
        service.quote(OPERATOR_ID, RFQ_ID, {
          unitPrice: '900',
          expiresAt: '2020-01-01T00:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records the quote with line total and audits it', async () => {
      prisma.rfq.findUnique.mockResolvedValue(rfqRow());
      const quoted = rfqRow({
        status: RfqStatus.QUOTED,
        quotedUnitPrice: D(900),
      });
      prisma.rfq.update.mockResolvedValue(quoted);

      const dto = await service.quote(
        OPERATOR_ID,
        RFQ_ID,
        { unitPrice: '900' },
        '127.0.0.1',
      );

      expect(dto.status).toBe('QUOTED');
      expect(dto.quotedUnitPrice).toBe('900');
      expect(dto.quotedLineTotal).toBe('4500');
      const updateData = prisma.rfq.update.mock.calls[0][0].data;
      expect(updateData.quotedBy).toBe(OPERATOR_ID);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RFQ_QUOTED', entity: 'Rfq' }),
      );
    });
  });

  describe('accept', () => {
    it('rejects accepting before any quote with 409', async () => {
      prisma.rfq.findUnique.mockResolvedValue(rfqRow());

      await expect(
        service.accept(USER_ID, RFQ_ID, {
          addressId: VARIANT_ID,
          paymentMethod: 'COD',
          shippingMethod: 'STORE_PICKUP',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(checkout.placeQuotedOrder).not.toHaveBeenCalled();
    });

    it('marks lapsed quotations EXPIRED, audits, and 410s', async () => {
      const lapsed = rfqRow({
        status: RfqStatus.QUOTED,
        quotedUnitPrice: D(900),
        expiresAt: new Date(Date.now() - 1000),
      });
      prisma.rfq.findUnique.mockResolvedValue(lapsed);
      prisma.rfq.update.mockResolvedValue({
        ...lapsed,
        status: RfqStatus.EXPIRED,
      });

      await expect(
        service.accept(USER_ID, RFQ_ID, {
          addressId: VARIANT_ID,
          paymentMethod: 'COD',
          shippingMethod: 'STORE_PICKUP',
        }),
      ).rejects.toBeInstanceOf(GoneException);
      expect(prisma.rfq.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: RfqStatus.EXPIRED }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RFQ_EXPIRED', entity: 'Rfq' }),
      );
      expect(checkout.placeQuotedOrder).not.toHaveBeenCalled();
    });

    it('freezes the quoted unit into an order and audits acceptance', async () => {
      const quoted = rfqRow({
        status: RfqStatus.QUOTED,
        quotedUnitPrice: D(900),
      });
      prisma.rfq.findUnique.mockResolvedValue(quoted);
      checkout.placeQuotedOrder.mockResolvedValue({
        orderId: 'order-1',
        orderNumber: 100002,
        status: 'PENDING',
        total: '4500',
      });

      const result = await service.accept(
        USER_ID,
        RFQ_ID,
        { addressId: VARIANT_ID, paymentMethod: 'COD', shippingMethod: 'STORE_PICKUP' },
        '127.0.0.1',
      );

      expect(result).toEqual({
        orderId: 'order-1',
        orderNumber: 100002,
        status: 'PENDING',
        total: '4500',
      });
      expect(checkout.placeQuotedOrder).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          rfqId: RFQ_ID,
          variantId: VARIANT_ID,
          quantity: 5,
          addressId: VARIANT_ID,
          paymentMethod: 'COD',
          shippingMethod: 'STORE_PICKUP',
        }),
      );
      const frozen = checkout.placeQuotedOrder.mock.calls[0][1]
        .unitPrice as Prisma.Decimal;
      expect(frozen.toString()).toBe('900');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RFQ_ACCEPTED', entity: 'Rfq' }),
      );
    });

    it('replays the original order on double-accept (idempotent)', async () => {
      prisma.rfq.findUnique.mockResolvedValue(
        rfqRow({ status: RfqStatus.ACCEPTED, orderId: 'order-1' }),
      );
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        orderNumber: 100002,
        status: 'PENDING',
        total: D(4500),
      });

      const result = await service.accept(USER_ID, RFQ_ID, {
        addressId: VARIANT_ID,
        paymentMethod: 'COD',
        shippingMethod: 'STORE_PICKUP',
      });

      expect(result.orderId).toBe('order-1');
      expect(checkout.placeQuotedOrder).not.toHaveBeenCalled();
    });

    it('hides other users\u2019 rows with 404', async () => {
      prisma.rfq.findUnique.mockResolvedValue(
        rfqRow({ userId: 'someone-else' }),
      );

      await expect(
        service.accept(USER_ID, RFQ_ID, {
          addressId: VARIANT_ID,
          paymentMethod: 'COD',
          shippingMethod: 'STORE_PICKUP',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reject', () => {
    it('rejects a quoted row and audits it', async () => {
      prisma.rfq.findUnique.mockResolvedValue(
        rfqRow({ status: RfqStatus.QUOTED, quotedUnitPrice: D(900) }),
      );
      prisma.rfq.update.mockResolvedValue(
        rfqRow({ status: RfqStatus.REJECTED }),
      );

      const dto = await service.reject(OPERATOR_ID, RFQ_ID);

      expect(dto.status).toBe('REJECTED');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RFQ_REJECTED', entity: 'Rfq' }),
      );
    });

    it('refuses to reject an accepted row with 409', async () => {
      prisma.rfq.findUnique.mockResolvedValue(
        rfqRow({ status: RfqStatus.ACCEPTED, orderId: 'order-1' }),
      );

      await expect(service.reject(OPERATOR_ID, RFQ_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('list', () => {
    it('lazy-expires overdue rows on read', async () => {
      const overdue = rfqRow({
        expiresAt: new Date(Date.now() - 1000),
      });
      prisma.rfq.count.mockResolvedValue(1);
      prisma.rfq.findMany.mockResolvedValue([overdue]);
      prisma.$transaction.mockImplementation(
        async (args: Array<Promise<unknown>>) => Promise.all(args),
      );
      prisma.rfq.update.mockResolvedValue({
        ...overdue,
        status: RfqStatus.EXPIRED,
      });

      const result = await service.list(USER_ID, {}, false);

      expect(result.items[0]?.status).toBe('EXPIRED');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RFQ_EXPIRED', entity: 'Rfq' }),
      );
    });
  });

  describe('isOperator', () => {
    it('returns true for OPERATOR role holders', async () => {
      prisma.userRole.count.mockResolvedValue(1);
      await expect(service.isOperator(USER_ID)).resolves.toBe(true);
      expect(prisma.userRole.count).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          role: { name: { in: ['OPERATOR', 'ADMIN'] } },
        },
      });
    });

    it('never throws (pricing must degrade, never 500)', async () => {
      prisma.userRole.count.mockRejectedValue(new Error('db down'));
      await expect(service.isOperator(USER_ID)).resolves.toBe(false);
    });
  });
});
