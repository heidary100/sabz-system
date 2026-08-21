import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const REASON_MAX = 500;
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
 * Absolute inventory-adjustment input (SS-113). `quantity` is the ABSOLUTE
 * desired `quantityOnHand`, not a delta. `reason` is mandatory and trimmed.
 * Movement type and actor identity are server-owned and never accepted.
 */
export class AdjustInventoryDto {
  @ApiProperty({ description: 'Product variant to adjust', format: 'uuid' })
  @IsUUID('all', { message: 'variantId باید شناسه UUID معتبر باشد.' })
  variantId!: string;

  @ApiProperty({ description: 'Warehouse whose stock is adjusted', format: 'uuid' })
  @IsUUID('all', { message: 'warehouseId باید شناسه UUID معتبر باشد.' })
  warehouseId!: string;

  @ApiProperty({
    example: 12,
    description: 'Absolute desired quantityOnHand (>= 0), not a delta.',
    minimum: 0,
  })
  @IsInt({ message: 'quantity باید عدد صحیح باشد.' })
  @Min(0, { message: 'quantity نمیتواند منفی باشد.' })
  quantity!: number;

  @ApiProperty({
    example: 'تطبیق شمارش فیزیکی',
    description: 'Mandatory reason for the adjustment',
  })
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'reason باید رشته باشد.' })
  @IsNotEmpty({ message: 'reason الزامی است.' })
  @MaxLength(REASON_MAX, { message: `reason باید حداکثر ${REASON_MAX} کاراکتر باشد.` })
  reason!: string;

  @ApiPropertyOptional({ description: 'Optional notes about the adjustment' })
  @IsOptional()
  @Transform(({ value }) => normalizeOptional(value))
  @IsString({ message: 'notes باید رشته باشد.' })
  @MaxLength(NOTES_MAX, { message: `notes باید حداکثر ${NOTES_MAX} کاراکتر باشد.` })
  notes?: string;
}
