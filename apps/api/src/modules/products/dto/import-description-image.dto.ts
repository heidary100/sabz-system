import { IsNotEmpty, IsUrl } from 'class-validator';

/** Import an external image URL into controlled description-image storage. */
export class ImportDescriptionImageDto {
  @IsNotEmpty({ message: 'آدرس تصویر الزامی است.' })
  @IsUrl(
    { protocols: ['http', 'https'], require_tld: false },
    { message: 'آدرس تصویر باید یک URL معتبر باشد.' },
  )
  url!: string;
}