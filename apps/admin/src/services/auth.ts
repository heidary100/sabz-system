import { refreshSession } from './api'
import { request } from './api'
import type {
  AuthUser,
  OtpRequestResult,
  VerifyOtpResult,
} from '../types'

export async function requestOtp(mobile: string): Promise<OtpRequestResult> {
  return request<OtpRequestResult>(
    '/auth/request-otp',
    { method: 'POST', body: JSON.stringify({ mobile }) },
    { auth: false },
  )
}

export async function verifyOtp(
  mobile: string,
  code: string,
): Promise<VerifyOtpResult> {
  return request<VerifyOtpResult>(
    '/auth/verify-otp',
    { method: 'POST', body: JSON.stringify({ mobile, code }) },
    { auth: false },
  )
}

export async function getMe(): Promise<AuthUser> {
  return request<AuthUser>('/auth/me')
}

export async function logout(): Promise<void> {
  try {
    await request<{ loggedOut: boolean }>('/auth/logout', {
      method: 'POST',
    })
  } catch {
    // Best effort: the local session is cleared regardless of the response.
  }
}

export async function restoreSession(): Promise<boolean> {
  return refreshSession()
}
