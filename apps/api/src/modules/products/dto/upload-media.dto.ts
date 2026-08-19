import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ProductMediaType } from '@prisma/client';

/**
 * Optional multipart form fields accepted alongside the `file` on
 * POST /admin/products/:productId/media.
 *
 * `mediaType` is optional: when omitted it is inferred from the detected
 * content signature. `isPrimary` is accepted only for the first image (it is
 * otherwise ignored); `sortOrder` is never client-controlled in M1.
 */
export class UploadMediaDto {
  @ApiPropertyOptional({
    enum: ProductMediaType,
    description:
      'Optional declared media type. Inferred from detected content when omitted; rejected if it contradicts the detected content.',
  })
  @IsOptional()
  @IsEnum(ProductMediaType, { message: 'mediaType معتبر نیست.' })
  mediaType?: ProductMediaType;

  @ApiPropertyOptional({
    description: 'Optional variant id the media belongs to. Must belong to the product.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'variantId باید شناسه UUID معتبر باشد.' })
  variantId?: string;

  @ApiPropertyOptional({
    description:
      'Optional primary flag. Only meaningful for the first image (first image is automatically primary).',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean({ message: 'isPrimary باید مقدار بولی باشد.' })
  isPrimary?: boolean;
}
