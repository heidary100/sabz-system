import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { CART_MAX_QUANTITY } from './add-cart-item.dto';

export class UpdateCartItemDto {
  @ApiProperty({
    example: 2,
    minimum: 1,
    maximum: CART_MAX_QUANTITY,
    description: 'Absolute quantity (replaces the line quantity; 0 is invalid — use DELETE)',
  })
  @IsInt({ message: 'تعداد باید عدد صحیح باشد.' })
  @Min(1, { message: 'تعداد باید حداقل ۱ باشد.' })
  @Max(CART_MAX_QUANTITY, {
    message: `تعداد حداکثر ${CART_MAX_QUANTITY} عدد است.`,
  })
  quantity!: number;
}
