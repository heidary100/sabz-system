import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class AcceptRfqDto {
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
      'COD marks cash on delivery (SS-234); ONLINE is disabled with 422 until the gateway ticket (SS-234B).',
  })
  @IsEnum(['ONLINE', 'COD'], {
    message: 'شیوه پرداخت معتبر نیست.',
  })
  paymentMethod!: PaymentMethod;

  @ApiProperty({
    enum: ['TIPAX', 'IRAN_POST', 'LOCAL_DELIVERY', 'STORE_PICKUP'],
    example: 'TIPAX',
    description:
      'Shipping method (SS-241): fee is resolved server-side from env-driven flat rates; disabled methods 422.',
  })
  @IsEnum(['TIPAX', 'IRAN_POST', 'LOCAL_DELIVERY', 'STORE_PICKUP'], {
    message: 'شیوه ارسال معتبر نیست.',
  })
  shippingMethod!: string;
}
