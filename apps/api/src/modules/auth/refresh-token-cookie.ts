import type { Request, Response } from 'express';

export const REFRESH_TOKEN_COOKIE = 'sabz_refresh_token';
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';

export interface RefreshTokenCookieOptions {
  secure: boolean;
}

export function getRefreshTokenFromRequest(request: Request): string | undefined {
  return (request.cookies as Record<string, string | undefined> | undefined)?.[
    REFRESH_TOKEN_COOKIE
  ];
}

export function setRefreshTokenCookie(
  response: Response,
  refreshToken: string,
  maxAgeMs: number,
  options: RefreshTokenCookieOptions,
): void {
  response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: maxAgeMs,
  });
}

export function clearRefreshTokenCookie(
  response: Response,
  options: RefreshTokenCookieOptions,
): void {
  response.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
  });
}
