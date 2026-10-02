import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Partner-tier admin CRUD (SS-042 follow-up, #90): the DTOs only pin shapes;
 * cross-field/business rules (discountPercent 0–100, unique name, delete
 * while referenced) are enforced in `AdminPartnersService` with Persian
 * errors, mirroring the SS-240B pricing DTO split.
 */

/** Decimal(5,2) as string: up to 3 integer digits, optional 1–2 decimals. */
export const PARTNER_TIER_DISCOUNT_PATTERN = /^\d{1,3}(?:\.\d{1,2})?$/;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePartnerTierDto {
  @ApiProperty({ example: 'Tier 1 – Distributor' })
  @IsString({ message: 'name باید رشته باشد.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'name الزامی است.' })
  @MaxLength(80, { message: 'name باید حداکثر ۸۰ کاراکتر باشد.' })
  name!: string;

  @ApiProperty({
    example: '0',
    description: 'Discount percent. Decimal(5,2) string, 0–100.',
  })
  @IsString({ message: 'discountPercent باید رشته باشد.' })
  @Transform(trim)
  @Matches(PARTNER_TIER_DISCOUNT_PATTERN, {
    message: 'discountPercent معتبر نیست.',
  })
  discountPercent!: string;

  @ApiProperty({ example: 1, description: 'Minimum cart quantity to unlock.' })
  @Type(() => Number)
  @IsInt({ message: 'minOrderQuantity باید عدد صحیح باشد.' })
  @Min(1, { message: 'minOrderQuantity باید حداقل ۱ باشد.' })
  minOrderQuantity!: number;
}

export class UpdatePartnerTierDto {
  @ApiPropertyOptional({ example: 'Tier 1 – Distributor' })
  @IsOptional()
  @IsString({ message: 'name باید رشته باشد.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'name الزامی است.' })
  @MaxLength(80, { message: 'name باید حداکثر ۸۰ کاراکتر باشد.' })
  name?: string;

  @ApiPropertyOptional({
    example: '12.5',
    description: 'Discount percent. Decimal(5,2) string, 0–100.',
  })
  @IsOptional()
  @IsString({ message: 'discountPercent باید رشته باشد.' })
  @Transform(trim)
  @Matches(PARTNER_TIER_DISCOUNT_PATTERN, {
    message: 'discountPercent معتبر نیست.',
  })
  discountPercent?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'minOrderQuantity باید عدد صحیح باشد.' })
  @Min(1, { message: 'minOrderQuantity باید حداقل ۱ باشد.' })
  minOrderQuantity?: number;
}
