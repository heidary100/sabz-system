import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import type { PaymentMethod } from '@sabz/types';

/**
 * Place-order input (SS-233). The client sends only the address reference
 * and payment choice — never money (CART-004): prices, totals and snapshots
 * are resolved server-side from live variant rows inside the checkout flow.
 */
export class PlaceOrderDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'One of the user\u2019s address-book entries (snapshotted into the order)',
  })
  @IsUUID('4', { message: 'addressId باید یک شناسه معتبر باشد.' })
  addressId!: string;

  @ApiProperty({
    enum: ['ONLINE', 'COD'],
    example: 'COD',
    description:
      'ONLINE reserves for gateway payment (SS-234); COD marks cash on delivery. Both create an unpaid (PENDING) order in v1.',
  })
  @IsEnum(['ONLINE', 'COD'], {
    message: 'شیوه پرداخت معتبر نیست.',
  })
  paymentMethod!: PaymentMethod;
}
