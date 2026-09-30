import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateReturnItemDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Order line to return (must belong to the order)',
  })
  @IsUUID('4', { message: 'orderItemId باید یک شناسه معتبر باشد.' })
  orderItemId!: string;

  @ApiProperty({ example: 1, description: 'Quantity to return (≤ ordered)' })
  @IsInt({ message: 'quantity باید عدد صحیح باشد.' })
  @Min(1, { message: 'quantity باید بزرگتر از صفر باشد.' })
  quantity!: number;
}

export class CreateReturnRequestDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Owned DELIVERED order to return from',
  })
  @IsUUID('4', { message: 'orderId باید یک شناسه معتبر باشد.' })
  orderId!: string;

  @ApiProperty({
    example: 'کالا معیوب به دستم رسید.',
    description: 'Return reason, 1–1000 characters',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'دلیل مرجوعی باید رشته باشد.' })
  @MinLength(1, { message: 'دلیل مرجوعی الزامی است.' })
  @MaxLength(1000, { message: 'دلیل مرجوعی باید حداکثر ۱۰۰۰ کاراکتر باشد.' })
  reason!: string;

  @ApiProperty({
    type: [CreateReturnItemDto],
    description: 'Return lines (at least one)',
  })
  @IsArray({ message: 'اقلام مرجوعی الزامی است.' })
  @ArrayMinSize(1, { message: 'حداقل یک قلم برای مرجوعی لازم است.' })
  @ValidateNested({ each: true })
  @Type(() => CreateReturnItemDto)
  items!: CreateReturnItemDto[];
}
