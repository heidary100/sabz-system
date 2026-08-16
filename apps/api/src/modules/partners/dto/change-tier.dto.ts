import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class ChangeTierDto {
  @ApiProperty({ description: 'Partner tier to assign' })
  @IsUUID('4', { message: 'tierId معتبر نیست.' })
  @IsNotEmpty({ message: 'tierId الزامی است.' })
  tierId!: string;
}
