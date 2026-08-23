import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** Upper bound for `expiresIn`: 10 years in seconds. Keeps the derived
 * `expiresAt` well inside JavaScript's safe Date range (overflow would
 * otherwise surface as a 500 instead of a validation 400). */
const EXPIRES_IN_MAX_SECONDS = 315_360_000;

/**
 * Reserve-stock input (SS-115). `quantity` is the number of units to hold as
 * unreserved-ineligible stock against the existing `InventoryItem` for the
 * exact `(variantId, warehouseId)` pair; `expiresIn` (seconds) derives
 * `Reservation.expiresAt` server-side (`now + expiresIn * 1000`) and is
 * optional — an absent `expiresIn` means the reservation never expires.
 * Reservation state, movement type and actor identity are server-owned and
 * never accepted from the client.
 */
export class ReserveInventoryDto {
  @ApiProperty({ description: 'Product variant to reserve', format: 'uuid' })
  @IsUUID('all', { message: 'variantId باید شناسه UUID معتبر باشد.' })
  variantId!: string;

  @ApiProperty({ description: 'Warehouse holding the stock', format: 'uuid' })
  @IsUUID('all', { message: 'warehouseId باید شناسه UUID معتبر باشد.' })
  warehouseId!: string;

  @ApiProperty({
    example: 3,
    description: 'Positive quantity to reserve against quantityReserved.',
    minimum: 1,
  })
  @IsInt({ message: 'quantity باید عدد صحیح باشد.' })
  @Min(1, { message: 'quantity باید بزرگتر از صفر باشد.' })
  quantity!: number;

  @ApiPropertyOptional({
    example: 3600,
    description:
      'Optional reservation lifetime in seconds (max 10 years); expiresAt is derived server-side. Absent means the reservation never expires.',
    minimum: 1,
    maximum: EXPIRES_IN_MAX_SECONDS,
  })
  @IsOptional()
  @IsInt({ message: 'expiresIn باید عدد صحیح باشد.' })
  @Min(1, { message: 'expiresIn باید بزرگتر از صفر باشد.' })
  @Max(EXPIRES_IN_MAX_SECONDS, {
    message: `expiresIn باید حداکثر ${EXPIRES_IN_MAX_SECONDS} ثانیه باشد.`,
  })
  expiresIn?: number;
}