import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  IsUUID,
} from 'class-validator';
import type { PaymentMethod } from '@sabz/types';

function normalizeNote(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Place-order input (SS-233, extended SS-900). The client sends only the
 * address reference, payment choice, note and national ID — never money
 * (CART-004): prices, totals and snapshots are resolved server-side.
 *
 * The national ID is accepted here so first-time buyers can complete the
 * mandatory checkout requirement without visiting the profile first. It is
 * validated with the same MOD-11 rule as the profile and never logged.
 */
export class PlaceOrderDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'One of the user\u2019s address-book entries (snapshotted into the order)',
  })
  @IsUUID('4', { message: 'addressId باید یک شناسه معتبر باشد.' })
  addressId!: string;

  @ApiProperty({
    enum: ['ONLINE', 'COD'],
    example: 'COD',
    description:
      'COD marks cash on delivery (SS-234); ONLINE stays disabled with 422 until a provider is configured.',
  })
  @IsEnum(['ONLINE', 'COD'], {
    message: 'شیوه پرداخت معتبر نیست.',
  })
  paymentMethod!: PaymentMethod;

  @ApiProperty({
    enum: ['TIPAX', 'IRAN_POST', 'LOCAL_DELIVERY', 'STORE_PICKUP'],
    example: 'TIPAX',
    description:
      'Shipping method (SS-241): fee is resolved server-side from env-driven flat rates; disabled methods 422.',
  })
  @IsEnum(['TIPAX', 'IRAN_POST', 'LOCAL_DELIVERY', 'STORE_PICKUP'], {
    message: 'شیوه ارسال معتبر نیست.',
  })
  shippingMethod!: string;

  @ApiPropertyOptional({
    description: 'Optional plain-text order note (max 1000 chars)',
    maxLength: 1000,
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNote(value))
  @IsString({ message: 'یادداشت سفارش باید متن باشد.' })
  @MaxLength(1000, { message: 'یادداشت سفارش حداکثر ۱۰۰۰ کاراکتر است.' })
  note?: string;

  @ApiPropertyOptional({
    description:
      'Personal national ID (کد ملی). Required when the profile has none; 10 digits with a valid check digit.',
    example: '0012345679',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'کد ملی باید متن باشد.' })
  @MaxLength(20, { message: 'کد ملی معتبر نیست.' })
  nationalId?: string;

  @ApiPropertyOptional({ enum: ['SNAPPAY', 'DIGIPAY'] })
  @IsOptional()
  @IsEnum(['SNAPPAY', 'DIGIPAY'], {
    message: 'درگاه پرداخت انتخاب‌شده معتبر نیست.',
  })
  paymentProvider?: 'SNAPPAY' | 'DIGIPAY';
}
