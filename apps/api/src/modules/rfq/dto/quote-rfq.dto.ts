import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';
import { PRICE_12_2_PATTERN } from '../../products/dto/create-variant.dto';

export class QuoteRfqDto {
  @ApiPropertyOptional({
    example: '1500.00',
    description:
      'Operator-quoted unit price in Rial (Decimal(12,2) string, must be > 0). This is the price agreement frozen into the order at accept.',
  })
  @IsString({ message: 'unitPrice باید رشته باشد.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PRICE_12_2_PATTERN, {
    message: 'unitPrice باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.',
  })
  unitPrice!: string;

  @ApiPropertyOptional({
    example: '2026-10-05T00:00:00.000Z',
    description:
      'Quotation expiry override (ISO 8601, must be in the future). Defaults to 7 days when omitted.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'expiresAt باید یک زمان ISO 8601 معتبر باشد.' })
  expiresAt?: string;
}
