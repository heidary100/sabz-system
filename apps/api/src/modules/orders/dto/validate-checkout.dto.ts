import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Checkout-validation input (SS-233). Read-only preview (no side effects):
 * the wizard review step calls this to surface shortages and price drift
 * before the user commits. Address is optional — validation is about the
 * cart lines, not the destination.
 */
export class ValidateCheckoutDto {
  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Optional address-book entry to confirm ownership up front',
  })
  @IsOptional()
  @IsUUID('4', { message: 'addressId باید یک شناسه معتبر باشد.' })
  addressId?: string;
}
