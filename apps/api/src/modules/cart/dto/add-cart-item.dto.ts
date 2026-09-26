import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** Maximum units per cart line (SS-232): prevents absurd lines; stock caps below this. */
export const CART_MAX_QUANTITY = 99;

export class AddCartItemDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Purchasable (PRICED, in-stock) variant to add',
    required: false,
  })
  @IsOptional()
  @IsUUID('4', { message: 'variantId باید یک شناسه معتبر باشد.' })
  variantId?: string;

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description:
      'Published product to quick-add: resolves to its default purchasable variant (first in-stock PRICED). Exactly one of variantId/productId is required.',
    required: false,
  })
  @IsOptional()
  @IsUUID('4', { message: 'productId باید یک شناسه معتبر باشد.' })
  productId?: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: CART_MAX_QUANTITY })
  @IsInt({ message: 'تعداد باید عدد صحیح باشد.' })
  @Min(1, { message: 'تعداد باید حداقل ۱ باشد.' })
  @Max(CART_MAX_QUANTITY, {
    message: `تعداد حداکثر ${CART_MAX_QUANTITY} عدد است.`,
  })
  quantity!: number;
}
