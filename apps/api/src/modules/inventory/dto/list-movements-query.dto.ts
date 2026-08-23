import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { InventoryMovementType } from '@prisma/client';

/**
 * Admin inventory-movement history query (SS-114). `from`/`to` bound
 * `createdAt` inclusively; the `from > to` cross-field check lives in
 * InventoryService, mirroring the SS-064 audit query convention. All eleven
 * enum members are accepted as filters, including forward-declared movement
 * types that are not produced by M1 mutations.
 */
export class ListMovementsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number, starting at 1.',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page باید عدد صحیح باشد.' })
  @Min(1, { message: 'page باید حداقل ۱ باشد.' })
  page?: number;

  @ApiPropertyOptional({
    description: 'Page size. Maximum 100.',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد.' })
  @Min(1, { message: 'limit باید حداقل ۱ باشد.' })
  @Max(100, { message: 'limit باید حداکثر ۱۰۰ باشد.' })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter movements for one variant (historical rows included).',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('all', { message: 'variantId باید شناسه UUID معتبر باشد.' })
  variantId?: string;

  @ApiPropertyOptional({
    description: 'Filter movements for one warehouse (historical rows included).',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('all', { message: 'warehouseId باید شناسه UUID معتبر باشد.' })
  warehouseId?: string;

  @ApiPropertyOptional({
    enum: InventoryMovementType,
    description:
      'Filter by movement type. All eleven enum values are valid, including forward-declared types not produced in M1.',
  })
  @IsOptional()
  @IsEnum(InventoryMovementType, { message: 'type معتبر نیست.' })
  type?: InventoryMovementType;

  @ApiPropertyOptional({
    description:
      'Lower bound of the createdAt window (ISO 8601 UTC), inclusive.',
    format: 'date-time',
  })
  @IsOptional()
  @IsISO8601(undefined, { message: 'from باید یک زمان ISO 8601 معتبر باشد.' })
  from?: string;

  @ApiPropertyOptional({
    description:
      'Upper bound of the createdAt window (ISO 8601 UTC), inclusive.',
    format: 'date-time',
  })
  @IsOptional()
  @IsISO8601(undefined, { message: 'to باید یک زمان ISO 8601 معتبر باشد.' })
  to?: string;
}