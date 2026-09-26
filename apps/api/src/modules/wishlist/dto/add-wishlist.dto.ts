import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddWishlistDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Published product to save to the wishlist',
  })
  @IsUUID('4', { message: 'productId must be a valid UUID' })
  productId!: string;
}
