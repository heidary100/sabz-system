import { Heading } from '../components/catalyst/heading'

export function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-zinc-100">
      <div className="w-full max-w-sm space-y-6 rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5">
        <Heading level={1}>Login</Heading>
        <p className="text-sm text-zinc-600">Authentication is not implemented yet.</p>
      </div>
    </div>
  )
}
