import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Multer enforces the hard 10 MB interceptor limit and NestJS converts the
 * resulting LIMIT_FILE_SIZE error into a 413 PayloadTooLargeException before
 * the handler runs. Map it to the documented 400 validation error so the API
 * contract for oversized uploads stays consistent.
 */
@Catch(PayloadTooLargeException)
export class OversizedUploadFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const error = new BadRequestException(
      'حجم فایل باید حداکثر ۱۰ مگابایت باشد.',
    );
    response.status(error.getStatus()).json(error.getResponse());
  }
}
