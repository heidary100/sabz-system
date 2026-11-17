import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadMerchMediaDto {
  @ApiPropertyOptional({
    description: 'Optional Persian alt text; safe for decorative media to omit.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'altFa باید رشته باشد.' })
  @MaxLength(160, { message: 'altFa باید حداکثر ۱۶۰ کاراکتر باشد.' })
  altFa?: string;
}
