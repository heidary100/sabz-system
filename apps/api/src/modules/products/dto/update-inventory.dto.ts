import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/**
 * Absolute replacement of a variant's M1 stock snapshot (EPIC-005 boundary).
 * No delta, no movement history — those belong to EPIC-006.
 */
export class UpdateVariantInventoryDto {
  @ApiProperty({
    example: 5,
    description:
      'Absolute stockQuantity (M1 availability snapshot). Must be >= 0.',
  })
  @IsInt({ message: 'stockQuantity باید عدد صحیح باشد.' })
  @Min(0, { message: 'stockQuantity نمیتواند منفی باشد.' })
  stockQuantity!: number;
}
