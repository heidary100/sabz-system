import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

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
      'Optional reservation lifetime in seconds; expiresAt is derived server-side. Absent means the reservation never expires.',
    minimum: 1,
  })
  @IsOptional()
  @IsInt({ message: 'expiresIn باید عدد صحیح باشد.' })
  @Min(1, { message: 'expiresIn باید بزرگتر از صفر باشد.' })
  expiresIn?: number;
}