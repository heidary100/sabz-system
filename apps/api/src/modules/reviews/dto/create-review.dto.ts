import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Published product to review (one review per user×product)',
  })
  @IsUUID('4', { message: 'productId باید یک شناسه معتبر باشد.' })
  productId!: string;

  @ApiProperty({ example: 5, description: 'Star rating, integer 1–5' })
  @IsInt({ message: 'امتیاز باید عدد صحیح باشد.' })
  @Min(1, { message: 'امتیاز باید بین ۱ تا ۵ باشد.' })
  @Max(5, { message: 'امتیاز باید بین ۱ تا ۵ باشد.' })
  rating!: number;

  @ApiPropertyOptional({
    example: 'کیفیت ساخت عالی بود.',
    description: 'Optional comment, max 2000 characters',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'دیدگاه باید رشته باشد.' })
  @MaxLength(2000, { message: 'دیدگاه باید حداکثر ۲۰۰۰ کاراکتر باشد.' })
  comment?: string;
}
