import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import type { AdminOrderTransition } from '@sabz/types';

/**
 * Operator order-status transition (SS-240A). Only forward moves plus
 * CANCELLED are accepted; terminal states (DELIVERED/CANCELLED) are never
 * valid input — the service re-checks against the stored row and 409s.
 */
export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: ['PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
  })
  @IsEnum(['PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'], {
    message: 'وضعیت سفارش معتبر نیست.',
  })
  status!: AdminOrderTransition;
}
