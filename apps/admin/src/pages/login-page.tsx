import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth-provider'
import { Button } from '../components/catalyst/button'
import { Field, Label } from '../components/catalyst/fieldset'
import { Heading } from '../components/catalyst/heading'
import { Input } from '../components/catalyst/input'
import { Text } from '../components/catalyst/text'
import { ApiError } from '../services/api'
import * as authService from '../services/auth'

const MOBILE_REGEX = /^(\+98|0)9\d{9}$/
const OTP_REGEX = /^\d{6}$/

type Step = 'phone' | 'otp'

interface LoginLocationState {
  from?: string
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

export function LoginPage() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as LoginLocationState | null)?.from ?? '/dashboard'

  const [step, setStep] = useState<Step>('phone')
  const [mobile, setMobile] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) {
      return
    }
    const timer = setInterval(() => setResendIn((seconds) => seconds - 1), 1000)
    return () => clearInterval(timer)
  }, [resendIn])

  if (status === 'authenticated') {
    return <Navigate to={from} replace />
  }

  const handleSendCode = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)

    if (!MOBILE_REGEX.test(mobile)) {
      setError('Enter a valid Iranian mobile number (e.g. +989123456789).')
      return
    }

    setSubmitting(true)
    try {
      const result = await authService.requestOtp(mobile)
      setDevCode(result.code ?? null)
      setCode('')
      setStep('otp')
      setResendIn(result.expiresIn)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerify = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)

    if (!OTP_REGEX.test(code)) {
      setError('Enter the 6-digit code.')
      return
    }

    setSubmitting(true)
    try {
      await login(mobile, code)
      navigate(from, { replace: true })
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async (): Promise<void> => {
    setError(null)
    setSubmitting(true)
    try {
      const result = await authService.requestOtp(mobile)
      setDevCode(result.code ?? null)
      setCode('')
      setResendIn(result.expiresIn)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-zinc-100">
      <div className="w-full max-w-sm space-y-6 rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5">
        <Heading level={1}>Sabz Admin</Heading>

        {step === 'phone' ? (
          <form className="space-y-6" onSubmit={handleSendCode}>
            <Field>
              <Label>Mobile number</Label>
              <Input
                type="tel"
                name="mobile"
                autoComplete="tel"
                placeholder="+989123456789"
                value={mobile}
                onChange={(event) => setMobile(event.target.value)}
                disabled={submitting}
              />
            </Field>

            {error && (
              <Text className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-600/20">
                {error}
              </Text>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send code'}
            </Button>
          </form>
        ) : (
          <form className="space-y-6" onSubmit={handleVerify}>
            <Field>
              <Label>Verification code</Label>
              <Input
                type="text"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={submitting}
              />
            </Field>

            {devCode && (
              <Text className="rounded-md bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-950/5">
                Development code: {devCode}
              </Text>
            )}

            {error && (
              <Text className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-600/20">
                {error}
              </Text>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Verifying…' : 'Verify & sign in'}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <Button
                type="button"
                plain
                onClick={() => {
                  setStep('phone')
                  setError(null)
                }}
                disabled={submitting}
              >
                Change number
              </Button>
              <Button
                type="button"
                plain
                onClick={() => void handleResend()}
                disabled={submitting || resendIn > 0}
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
