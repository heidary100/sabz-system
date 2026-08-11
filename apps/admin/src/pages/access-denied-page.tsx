import { useAuth } from '../auth/auth-provider'
import { Button } from '../components/catalyst/button'
import { Heading } from '../components/catalyst/heading'
import { Text } from '../components/catalyst/text'

export function AccessDeniedPage() {
  const { logout } = useAuth()

  return (
    <div className="flex min-h-svh items-center justify-center bg-zinc-100">
      <div className="w-full max-w-sm space-y-6 rounded-lg bg-white p-6 text-center shadow-xs ring-1 ring-zinc-950/5">
        <Heading level={1}>Access denied</Heading>
        <Text>
          Your account does not have permission to access the admin dashboard.
        </Text>
        <Button
          outline
          className="w-full"
          onClick={() => void logout()}
        >
          Sign out
        </Button>
      </div>
    </div>
  )
}
