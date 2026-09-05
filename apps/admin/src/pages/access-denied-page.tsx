import { useAuth } from '../auth/auth-provider'
import { Button } from '../components/catalyst/button'
import { Heading } from '../components/catalyst/heading'
import { Text } from '../components/catalyst/text'

export function AccessDeniedPage() {
  const { user, logout } = useAuth()

  return (
    <div className="ambient flex min-h-svh items-center justify-center px-4">
      <div className="glass w-full max-w-sm space-y-6 rounded-xl p-8 text-center">
        <Heading level={1}>دسترسی غیرمجاز</Heading>
        <Text>حساب کاربری شما مجوز دسترسی به پنل مدیریت را ندارد.</Text>
        {user?.mobile && (
          <Text>
            با شماره <span dir="ltr">{user.mobile}</span> وارد شدهاید. برای ورود
            مدیریتی، از شماره مدیر پیشفرض استفاده کنید.
          </Text>
        )}
        <Button outline className="w-full" onClick={() => void logout()}>
          خروج از حساب
        </Button>
      </div>
    </div>
  )
}
