import { useAuth } from '../auth/auth-provider'
import { Button } from '../components/catalyst/button'
import { Heading } from '../components/catalyst/heading'
import { Text } from '../components/catalyst/text'

export function AccessDeniedPage() {
  const { logout } = useAuth()

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-white p-8 text-center shadow-xs">
        <Heading level={1}>دسترسی غیرمجاز</Heading>
        <Text>حساب کاربری شما مجوز دسترسی به پنل مدیریت را ندارد.</Text>
        <Button outline className="w-full" onClick={() => void logout()}>
          خروج از حساب
        </Button>
      </div>
    </div>
  )
}
