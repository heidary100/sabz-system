import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

/**
 * Swagger/documentation shape for the metadata patch. The controller reads the
 * raw body and rejects unknown keys explicitly because the global ValidationPipe
 * whitelists rather than rejects extra fields.
 */
export class UpdateMerchMediaDto {
  @ApiPropertyOptional({
    description: 'Persian alt text; null clears it. Only editable metadata field.',
    nullable: true,
  })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString({ message: 'altFa باید رشته باشد.' })
  @MaxLength(160, { message: 'altFa باید حداکثر ۱۶۰ کاراکتر باشد.' })
  altFa?: string | null;
}
