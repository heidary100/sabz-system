import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  browserPushEnabled?: boolean;
}

export class PushKeysDto {
  @ApiProperty()
  @IsString({ message: 'کلید عمومی اشتراک الزامی است.' })
  @MaxLength(500)
  p256dh!: string;

  @ApiProperty()
  @IsString({ message: 'کلید احراز اشتراک الزامی است.' })
  @MaxLength(500)
  auth!: string;
}

export class PushSubscriptionDto {
  @ApiProperty()
  @IsUrl(
    { require_protocol: true, protocols: ['https'] },
    { message: 'نشانی اشتراک اعلان معتبر نیست.' },
  )
  @MaxLength(2048)
  endpoint!: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

export class UnsubscribePushDto {
  @ApiProperty()
  @IsString({ message: 'نشانی اشتراک الزامی است.' })
  @MaxLength(2048)
  endpoint!: string;
}
