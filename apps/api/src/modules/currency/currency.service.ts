import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CurrencyCode, Prisma } from '@prisma/client';
import {
  CURRENCY_FA,
  type CurrencyConversionResponse,
  type CurrencyRateDto,
  type CurrencyRateListResponse,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateCurrencyRateDto } from './dto/currency.dto';

const MAX_RATE = new Prisma.Decimal('1000000000000');

type CurrencyRateRow = Prisma.CurrencyRateGetPayload<Record<string, never>>;

/**
 * Manual FX rate administration (SS-900).
 *
 * Rates are operator-entered values, never live market data. Every write is
 * append-only and audited; the effective rate is the newest row at/before
 * now. Conversion is admin-side only and never exposed to the storefront.
 */
@Injectable()
export class CurrencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    currency: CurrencyCode | undefined,
    page: number,
    limit: number,
  ): Promise<CurrencyRateListResponse> {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit =
      Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
    const where: Prisma.CurrencyRateWhereInput = currency
      ? { currency }
      : {};
    const [total, rows, currentRows] = await this.prisma.$transaction([
      this.prisma.currencyRate.count({ where }),
      this.prisma.currencyRate.findMany({
        where,
        orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.currencyRate.findMany({
        where: { effectiveAt: { lte: new Date() } },
        orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
        distinct: ['currency'],
      }),
    ]);
    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page: safePage,
      limit: safeLimit,
      current: currentRows.map((row) => this.toDto(row)),
    };
  }

  async create(
    input: CreateCurrencyRateDto,
    userId: string,
    ipAddress?: string,
  ): Promise<CurrencyRateDto> {
    const rate = this.parsePositiveRate(input.rialPerUnit);
    const effectiveAt = input.effectiveAt
      ? new Date(input.effectiveAt)
      : new Date();
    if (Number.isNaN(effectiveAt.getTime())) {
      throw new BadRequestException('زمان اعتبار معتبر نیست.');
    }
    const note = input.note?.trim() || null;
    const row = await this.prisma.currencyRate.create({
      data: {
        currency: input.currency,
        rialPerUnit: rate,
        effectiveAt,
        note,
        createdBy: userId,
      },
    });
    await this.audit.log({
      userId,
      action: 'CURRENCY_RATE_CREATED',
      entity: 'CurrencyRate',
      entityId: row.id,
      after: {
        currency: row.currency,
        rialPerUnit: row.rialPerUnit.toString(),
        effectiveAt: row.effectiveAt.toISOString(),
      },
      ipAddress,
    });
    return this.toDto(row);
  }

  /** Current effective rate, or a non-disclosure 404 when none exists. */
  async current(currency: CurrencyCode): Promise<CurrencyRateDto> {
    const row = await this.prisma.currencyRate.findFirst({
      where: { currency, effectiveAt: { lte: new Date() } },
      orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (!row) {
      throw new NotFoundException('نرخی برای این واحد پول ثبت نشده است.');
    }
    return this.toDto(row);
  }

  async convert(
    currency: CurrencyCode,
    amount: string,
  ): Promise<CurrencyConversionResponse> {
    const parsedAmount = this.parsePositiveAmount(amount);
    const rate = await this.current(currency);
    const rial = parsedAmount.mul(new Prisma.Decimal(rate.rialPerUnit));
    return {
      currency,
      amount: parsedAmount.toFixed(2),
      rialPerUnit: rate.rialPerUnit,
      rial: rial.toFixed(2),
      effectiveAt: rate.effectiveAt,
    };
  }

  private parsePositiveRate(raw: string): Prisma.Decimal {
    let rate: Prisma.Decimal;
    try {
      rate = new Prisma.Decimal(raw);
    } catch {
      throw new BadRequestException('نرخ معتبر نیست.');
    }
    if (!rate.isFinite() || rate.lessThanOrEqualTo(0)) {
      throw new BadRequestException('نرخ باید بزرگ‌تر از صفر باشد.');
    }
    if (rate.greaterThan(MAX_RATE)) {
      throw new BadRequestException('نرخ خارج از محدوده مجاز است.');
    }
    if (rate.decimalPlaces() > 2) {
      throw new BadRequestException('نرخ حداکثر دو رقم اعشار دارد.');
    }
    return rate;
  }

  private parsePositiveAmount(raw: string): Prisma.Decimal {
    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(raw);
    } catch {
      throw new BadRequestException('مبلغ معتبر نیست.');
    }
    if (!amount.isFinite() || amount.lessThan(0)) {
      throw new BadRequestException('مبلغ باید صفر یا مثبت باشد.');
    }
    if (amount.decimalPlaces() > 2) {
      throw new BadRequestException('مبلغ حداکثر دو رقم اعشار دارد.');
    }
    return amount;
  }

  private toDto(row: CurrencyRateRow): CurrencyRateDto {
    return {
      id: row.id,
      currency: row.currency,
      currencyFa: CURRENCY_FA[row.currency],
      rialPerUnit: row.rialPerUnit.toString(),
      effectiveAt: row.effectiveAt.toISOString(),
      note: row.note,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
