import { Prisma, CurrencyCode } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrencyService } from './currency.service';

function makePrisma() {
  return {
    $transaction: jest.fn((ops: Array<Promise<unknown>>) => Promise.all(ops)),
    currencyRate: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
}

describe('CurrencyService (SS-900)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: { log: jest.Mock };
  let service: CurrencyService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = { log: jest.fn() };
    service = new CurrencyService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  it('returns current rates per currency and the paginated history', async () => {
    const row = {
      id: 'rate-1',
      currency: CurrencyCode.USD,
      rialPerUnit: new Prisma.Decimal('925000'),
      effectiveAt: new Date('2026-11-01T00:00:00.000Z'),
      note: null,
      createdBy: 'admin-1',
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
    };
    prisma.currencyRate.count.mockResolvedValue(1);
    prisma.currencyRate.findMany.mockResolvedValueOnce([row]).mockResolvedValueOnce([row]);

    const result = await service.list(undefined, 1, 50);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      currency: 'USD',
      currencyFa: 'دلار آمریکا',
      rialPerUnit: '925000',
    });
    expect(result.current).toHaveLength(1);
  });

  it('creates an audited positive rate and rejects malformed values', async () => {
    prisma.currencyRate.create.mockImplementation(async ({ data }) => ({
      id: 'rate-1',
      ...data,
      createdAt: new Date(),
    }));
    const dto = await service.create(
      { currency: CurrencyCode.USD, rialPerUnit: '925000' },
      'admin-1',
    );
    expect(dto.rialPerUnit).toBe('925000');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CURRENCY_RATE_CREATED' }),
    );

    for (const bad of ['0', '-1', '1.234', 'abc']) {
      await expect(
        service.create({ currency: CurrencyCode.USD, rialPerUnit: bad }, 'admin-1'),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it('converts using the newest effective manual rate', async () => {
    prisma.currencyRate.findFirst.mockResolvedValue({
      id: 'rate-1',
      currency: CurrencyCode.USD,
      rialPerUnit: new Prisma.Decimal('925000'),
      effectiveAt: new Date('2026-11-01T00:00:00.000Z'),
      note: null,
      createdBy: null,
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
    });
    const result = await service.convert(CurrencyCode.USD, '100');
    expect(result.rial).toBe('92500000.00');
    expect(result.rialPerUnit).toBe('925000');
  });

  it('returns a non-disclosure 404 when no effective rate exists', async () => {
    prisma.currencyRate.findFirst.mockResolvedValue(null);
    await expect(service.current(CurrencyCode.AED)).rejects.toMatchObject({
      status: 404,
    });
  });
});
