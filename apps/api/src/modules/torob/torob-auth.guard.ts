import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { verifyTorobToken } from './torob-auth';
import { TorobUnauthorizedException } from './torob-error';

/**
 * Verifies Torob's Ed25519-signed sync requests (SS-239, token guide §5).
 *
 * The token is read from `Authorization` (Bearer prefix optional) with an
 * `X-Torob-Token` fallback — the spec doc set was only partially reachable
 * when the contract was encoded, so both common header conventions are
 * accepted. `TOROB_JWT_PUBLIC_KEY_PEM` overrides the embedded published key
 * (tests/e2e sign with their own keypair); `\n` escapes are unescaped so a
 * single-line PEM from an env file still parses. Any verification failure is
 * the bare 401 the token guide mandates — never token internals.
 */
@Injectable()
export class TorobAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-torob-token'] ?? request.headers['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    const token = raw?.replace(/^Bearer\s+/i, '').trim();

    const audience = this.configService.get<string>(
      'TOROB_JWT_AUDIENCE',
      'localhost:3000',
    );
    const configuredPem = this.configService.get<string>('TOROB_JWT_PUBLIC_KEY_PEM');
    const publicKeyPem = configuredPem
      ? configuredPem.replace(/\\n/g, '\n')
      : undefined;

    const result = verifyTorobToken(token || undefined, audience, publicKeyPem);
    if (!result.ok) {
      throw new TorobUnauthorizedException();
    }
    return true;
  }
}
