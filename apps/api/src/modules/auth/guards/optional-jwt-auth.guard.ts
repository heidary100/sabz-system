import { ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Optional authentication (SS-235 B1): populates `request.user` when a
 * valid Bearer access token is present, otherwise lets the request through
 * as a guest (null instead of 401). Used by public catalog routes that
 * personalize read-only output — e.g. partner tier pricing on the public
 * price endpoint — while guests always degrade to retail (PRICE-002).
 */
@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override handleRequest(err: any, user: any): any {
    if (err || !user) {
      return null;
    }
    return user;
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      return true;
    }
    return true;
  }
}
