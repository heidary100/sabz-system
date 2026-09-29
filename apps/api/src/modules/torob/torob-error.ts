import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Torob-shaped errors (SS-239). The v3 spec mandates the exact
 * `{error: string}` envelope on 400s (and the token guide mandates a
 * bare 401 on auth failure); Nest's default `{message, error,
 * statusCode}` envelope would fail Torob's parsing, so these carry the
 * spec body explicitly. Messages are Persian per the admin/storefront
 * locale rule.
 */
export class TorobBadRequestException extends HttpException {
  constructor(message: string) {
    super({ error: message }, HttpStatus.BAD_REQUEST);
  }
}

export class TorobUnauthorizedException extends HttpException {
  constructor(message = 'احراز هویت ترب نامعتبر است.') {
    super({ error: message }, HttpStatus.UNAUTHORIZED);
  }
}
