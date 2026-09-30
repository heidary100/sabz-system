import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectReturnDto {
  @ApiProperty({
    example: 'مهلت مرجوعی به پایان رسیده است.',
    description: 'Operator rejection reason, 1–1000 characters',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'دلیل رد باید رشته باشد.' })
  @MinLength(1, { message: 'دلیل رد الزامی است.' })
  @MaxLength(1000, { message: 'دلیل رد باید حداکثر ۱۰۰۰ کاراکتر باشد.' })
  reason!: string;
}
