import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const NOTES_MAX = 1000;

function normalizeOptional(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return value;
}

/**
 * Receive-stock input (SS-113). `quantity` is a positive increment against the
 * existing `InventoryItem.quantityOnHand`; the movement type and actor identity
 * are server-owned and never accepted from the client.
 */
export class ReceiveStockDto {
  @ApiProperty({ description: 'Product variant to receive into', format: 'uuid' })
  @IsUUID('all', { message: 'variantId باید شناسه UUID معتبر باشد.' })
  variantId!: string;

  @ApiProperty({ description: 'Warehouse receiving the stock', format: 'uuid' })
  @IsUUID('all', { message: 'warehouseId باید شناسه UUID معتبر باشد.' })
  warehouseId!: string;

  @ApiProperty({
    example: 10,
    description: 'Positive quantity to add to quantityOnHand.',
    minimum: 1,
  })
  @IsInt({ message: 'quantity باید عدد صحیح باشد.' })
  @Min(1, { message: 'quantity باید بزرگتر از صفر باشد.' })
  quantity!: number;

  @ApiPropertyOptional({ description: 'Optional notes about the receipt' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'notes باید رشته باشد.' })
  @MaxLength(NOTES_MAX, { message: `notes باید حداکثر ${NOTES_MAX} کاراکتر باشد.` })
  notes?: string;
}
