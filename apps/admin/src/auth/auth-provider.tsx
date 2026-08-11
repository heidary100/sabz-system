import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  clearSession,
  onAuthStateChange,
  setAccessToken,
} from '../services/api'
import * as authService from '../services/auth'
import type { AppRole, AuthUser } from '../types'

export const ADMIN_ROLES: readonly AppRole[] = ['OPERATOR', 'ADMIN']

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  isAdmin: boolean
  login: (mobile: string, code: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

  const loadUser = useCallback(async (): Promise<AuthUser> => {
    const me = await authService.getMe()
    setUser(me)
    setStatus('authenticated')
    return me
  }, [])

  useEffect(() => {
    let cancelled = false

    async function restore(): Promise<void> {
      const restored = await authService.restoreSession()
      if (cancelled) {
        return
      }
      if (!restored) {
        setStatus('anonymous')
        return
      }
      try {
        await loadUser()
      } catch {
        if (!cancelled) {
          clearSession()
        }
      }
    }

    void restore()

    return () => {
      cancelled = true
    }
  }, [loadUser])

  useEffect(() => {
    return onAuthStateChange(() => {
      setUser(null)
      setStatus('anonymous')
    })
  }, [])

  const login = useCallback(
    async (mobile: string, code: string): Promise<void> => {
      const result = await authService.verifyOtp(mobile, code)
      setAccessToken(result.accessToken)
      await loadUser()
    },
    [loadUser],
  )

  const logout = useCallback(async (): Promise<void> => {
    await authService.logout()
    clearSession()
    setUser(null)
    setStatus('anonymous')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isAdmin: user?.roles.some((role) => ADMIN_ROLES.includes(role)) ?? false,
      login,
      logout,
    }),
    [status, user, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
