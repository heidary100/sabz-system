export interface ApiErrorPayload {
  statusCode: number
  message: string
  error: string
}

export type AppRole = 'CUSTOMER' | 'PARTNER' | 'OPERATOR' | 'ADMIN'

export type UserStatus = 'PENDING_OTP' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED'

export interface AuthUser {
  id: string
  mobile: string
  status: UserStatus
  roles: AppRole[]
}

export interface OtpRequestResult {
  sent: boolean
  expiresIn: number
  code?: string
}

export interface VerifyOtpResult {
  verified: boolean
  user: {
    id: string
    mobile: string
    status: UserStatus
  }
  accessToken: string
  refreshToken: string
}
