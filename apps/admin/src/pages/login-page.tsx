import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ADMIN_ROLES, useAuth } from '../auth/auth-provider'
import { Button } from '../components/catalyst/button'
import { Field, Label } from '../components/catalyst/fieldset'
import { Heading } from '../components/catalyst/heading'
import { Input } from '../components/catalyst/input'
import { Text } from '../components/catalyst/text'
import { translateApiError } from '../lib/error-messages'
import * as authService from '../services/auth'

const MOBILE_REGEX = /^(\+98|0)9\d{9}$/
const OTP_REGEX = /^\d{6}$/

type Step = 'phone' | 'otp'

interface LoginLocationState {
  from?: string
}

export function LoginPage() {
  const { status, user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as LoginLocationState | null)?.from ?? '/dashboard'
  const isAdminUser =
    user?.roles.some((role) => ADMIN_ROLES.includes(role)) ?? false

  const [step, setStep] = useState<Step>('phone')
  const [mobile, setMobile] = useState('')
  const [code, setCode] = useState('')
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

  if (status === 'authenticated' && isAdminUser) {
    return <Navigate to={from} replace />
  }

  const handleSendCode = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)

    if (!MOBILE_REGEX.test(mobile)) {
      setError('شماره موبایل معتبر وارد کنید (مثال: +989123456789).')
      return
    }

    setSubmitting(true)
    try {
      const result = await authService.requestOtp(mobile)
      setCode('')
      setStep('otp')
      setResendIn(result.expiresIn)
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerify = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)

    if (!OTP_REGEX.test(code)) {
      setError('کد تأیید ۶ رقمی را وارد کنید.')
      return
    }

    setSubmitting(true)
    try {
      await login(mobile, code)
      navigate(from, { replace: true })
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async (): Promise<void> => {
    setError(null)
    setSubmitting(true)
    try {
      const result = await authService.requestOtp(mobile)
      setCode('')
      setResendIn(result.expiresIn)
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ambient flex min-h-svh items-center justify-center px-4">
      <div className="glass rule-double-top w-full max-w-sm space-y-8 rounded-xl p-8 pt-7">
        <div className="space-y-2">
          <span className="text-xs font-semibold text-primary">پنل مدیریت</span>
          <Heading level={1}>سبز</Heading>
          <Text>
            {step === 'phone'
              ? 'برای ورود، شماره موبایل خود را وارد کنید.'
              : `کد ۶ رقمی ارسال‌شده به ${mobile} را وارد کنید.`}
          </Text>
        </div>

        {step === 'phone' ? (
          <form className="space-y-6" onSubmit={handleSendCode}>
            <Field>
              <Label>شماره موبایل</Label>
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
              <Text className="danger-box rounded-lg px-3 py-2 text-sm">
                {error}
              </Text>
            )}

            <Button type="submit" color="primary" className="w-full" disabled={submitting}>
              {submitting ? 'در حال ارسال…' : 'ارسال کد'}
            </Button>
          </form>
        ) : (
          <form className="space-y-6" onSubmit={handleVerify}>
            <Field>
              <Label>کد تأیید</Label>
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

            {error && (
              <Text className="danger-box rounded-lg px-3 py-2 text-sm">
                {error}
              </Text>
            )}

            <Button type="submit" color="primary" className="w-full" disabled={submitting}>
              {submitting ? 'در حال ورود…' : 'ورود'}
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
                تغییر شماره
              </Button>
              <Button
                type="button"
                plain
                onClick={() => void handleResend()}
                disabled={submitting || resendIn > 0}
              >
                {resendIn > 0 ? `ارسال مجدد کد تا ${resendIn} ثانیه دیگر` : 'ارسال مجدد کد'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
