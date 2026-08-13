import type { UserStatus } from './user';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RequestOtpInput {
  mobile: string;
}

export interface VerifyOtpInput {
  mobile: string;
  code: string;
}

export interface RefreshTokenInput {
  refreshToken?: string;
}

export interface OtpRequestResult {
  sent: boolean;
  expiresIn: number;
}

export interface VerifyOtpResult {
  verified: boolean;
  user: {
    id: string;
    mobile: string;
    status: UserStatus;
  };
  accessToken: string;
  refreshToken: string;
}

export interface LogoutResponse {
  loggedOut: true;
}
