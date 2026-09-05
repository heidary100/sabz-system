import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Multer enforces the hard interceptor limit (partner documents 10 MB, product
 * media 200 MB) and NestJS converts the resulting LIMIT_FILE_SIZE error into a
 * 413 PayloadTooLargeException before the handler runs. Map it to the
 * documented 400 validation error so the API contract for oversized uploads
 * stays consistent. The message is intentionally generic here because this
 * filter is shared by domains with different size caps; files within a
 * domain's cap but over its per-type limit are rejected by the domain's
 * service-level validation with a precise message.
 */
@Catch(PayloadTooLargeException)
export class OversizedUploadFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const error = new BadRequestException(
      'حجم فایل از حداکثر مجاز بیشتر است.',
    );
    response.status(error.getStatus()).json(error.getResponse());
  }
}
