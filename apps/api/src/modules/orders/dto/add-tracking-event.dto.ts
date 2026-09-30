import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShipmentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

const SHIPMENT_STATUSES: ShipmentStatus[] = [
  'PENDING',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];

/**
 * Operator tracking checkpoint (SS-241). Each event advances the shipment
 * to its status (forward-only plus CANCELLED); location/note are optional
 * operator context for the customer timeline.
 */
export class AddTrackingEventDto {
  @ApiProperty({
    enum: SHIPMENT_STATUSES,
    example: 'IN_TRANSIT',
    description: 'Status this checkpoint advances the shipment to',
  })
  @IsEnum(SHIPMENT_STATUSES, { message: 'وضعیت رهگیری معتبر نیست.' })
  status!: ShipmentStatus;

  @ApiPropertyOptional({
    example: 'تهران — مرکز تجزیه مبادلات',
    description: 'Optional operator location context',
  })
  @IsOptional()
  @IsString({ message: 'موقعیت باید متن باشد.' })
  @MaxLength(200, { message: 'موقعیت حداکثر ۲۰۰ نویسه است.' })
  location?: string;

  @ApiPropertyOptional({
    example: 'مرسوله تحویل باربری شد.',
    description: 'Optional operator note for the timeline',
  })
  @IsOptional()
  @IsString({ message: 'یادداشت باید متن باشد.' })
  @MaxLength(500, { message: 'یادداشت حداکثر ۵۰۰ نویسه است.' })
  note?: string;
}
