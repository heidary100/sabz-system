import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ReservationStatus } from '@prisma/client';

/**
 * Admin reservation-list query (SS-115). Filters are predicates: a valid but
 * nonexistent `variantId`/`warehouseId` returns an empty page, never 404.
 * `variantId`/`warehouseId` filter through the owning InventoryItem relation.
 */
export class ListReservationsQueryDto {
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
    enum: ReservationStatus,
    description: 'Filter reservations by status.',
  })
  @IsOptional()
  @IsEnum(ReservationStatus, { message: 'status معتبر نیست.' })
  status?: ReservationStatus;

  @ApiPropertyOptional({
    description: 'Filter reservations for one variant.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('all', { message: 'variantId باید شناسه UUID معتبر باشد.' })
  variantId?: string;

  @ApiPropertyOptional({
    description: 'Filter reservations for one warehouse.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('all', { message: 'warehouseId باید شناسه UUID معتبر باشد.' })
  warehouseId?: string;
}