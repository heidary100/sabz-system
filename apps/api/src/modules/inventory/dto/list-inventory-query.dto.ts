import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { INVENTORY_STOCK_STATUSES } from '@sabz/types';

export class ListInventoryQueryDto {
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
    description: 'Filter inventory rows for one variant.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('all', { message: 'variantId باید شناسه UUID معتبر باشد.' })
  variantId?: string;

  @ApiPropertyOptional({
    description: 'Filter inventory rows for one warehouse.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('all', { message: 'warehouseId باید شناسه UUID معتبر باشد.' })
  warehouseId?: string;

  @ApiPropertyOptional({
    enum: [...INVENTORY_STOCK_STATUSES],
    description:
      'Filter by derived stock status (IN_STOCK / LOW_STOCK / OUT_OF_STOCK).',
  })
  @IsOptional()
  @IsIn(INVENTORY_STOCK_STATUSES, { message: 'stockStatus معتبر نیست.' })
  stockStatus?: string;

  @ApiPropertyOptional({
    description: 'Search term matched against variant SKU or name.',
    maxLength: 64,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'search باید رشته باشد.' })
  @MaxLength(64, { message: 'search باید حداکثر ۶۴ کاراکتر باشد.' })
  search?: string;
}
