import { ApiPropertyOptional } from '@nestjs/swagger';
import { ShipmentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

const SHIPMENT_STATUSES: ShipmentStatus[] = [
  'PENDING',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];

/**
 * Operator shipment update (SS-241). Tracking numbers are operator-entered
 * (Tipax/Post are env-flag stubs — no carrier HTTP); status advances
 * forward-only plus CANCELLED, enforced in CheckoutService with 409s.
 */
export class UpdateShipmentDto {
  @ApiPropertyOptional({
    example: '1234567890',
    description: 'Operator-entered carrier tracking number (empty clears it)',
  })
  @IsOptional()
  @IsString({ message: 'کد رهگیری باید متن باشد.' })
  @MaxLength(100, { message: 'کد رهگیری حداکثر ۱۰۰ نویسه است.' })
  trackingNumber?: string;

  @ApiPropertyOptional({
    enum: SHIPMENT_STATUSES,
    description: 'Forward-only status advance (terminal states reject)',
  })
  @IsOptional()
  @IsEnum(SHIPMENT_STATUSES, { message: 'وضعیت ارسال معتبر نیست.' })
  status?: ShipmentStatus;
}
