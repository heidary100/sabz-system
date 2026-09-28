import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateRfqDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description:
      'CALL_FOR_PRICE variant to request a quotation for (PRICE-008: PRICED variants are rejected)',
  })
  @IsUUID('4', { message: 'variantId باید یک شناسه معتبر باشد.' })
  variantId!: string;

  @ApiProperty({
    example: 50,
    description: 'Requested quantity (positive integer)',
  })
  @IsInt({ message: 'quantity باید عدد صحیح باشد.' })
  @Min(1, { message: 'quantity باید بزرگتر از صفر باشد.' })
  quantity!: number;
}
