import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { CurrencyCode } from '@prisma/client';

const DECIMAL_18_2 = /^\d{1,16}(?:\.\d{1,2})?$/;

function trimOptional(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return value;
}

export class CreateCurrencyRateDto {
  @ApiProperty({ enum: CurrencyCode })
  @IsEnum(CurrencyCode, { message: 'واحد پول معتبر نیست.' })
  currency!: CurrencyCode;

  @ApiProperty({
    description: 'Rial per one unit of foreign currency (positive, ≤2 decimals)',
    example: '925000',
  })
  @IsString({ message: 'نرخ باید رشته عددی باشد.' })
  @Matches(DECIMAL_18_2, {
    message: 'نرخ باید عددی مثبت با حداکثر دو رقم اعشار باشد.',
  })
  rialPerUnit!: string;

  @ApiPropertyOptional({ description: 'ISO-8601 effective timestamp (default now)' })
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsISO8601({}, { message: 'زمان اعتبار باید تاریخ معتبر ISO باشد.' })
  effectiveAt?: string;

  @ApiPropertyOptional({ description: 'Operator note' })
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString({ message: 'توضیح باید رشته باشد.' })
  @MaxLength(500, { message: 'توضیح حداکثر ۵۰۰ کاراکتر است.' })
  note?: string;
}

export class ListCurrencyRatesQueryDto {
  @ApiPropertyOptional({ enum: CurrencyCode })
  @IsOptional()
  @IsEnum(CurrencyCode, { message: 'واحد پول معتبر نیست.' })
  currency?: CurrencyCode;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  limit?: number;
}

export class ConvertCurrencyQueryDto {
  @ApiProperty({ enum: CurrencyCode })
  @IsEnum(CurrencyCode, { message: 'واحد پول معتبر نیست.' })
  currency!: CurrencyCode;

  @ApiProperty({ example: '100' })
  @IsString({ message: 'مبلغ باید رشته عددی باشد.' })
  @Matches(DECIMAL_18_2, { message: 'مبلغ باید عددی مثبت باشد.' })
  amount!: string;
}
