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
  ApiError,
  clearSession,
  onAuthStateChange,
  setAccessToken,
} from '../services/api'
import * as authService from '../services/auth'
import type { AppRole, AuthUser } from '@sabz/types'

export const ADMIN_ROLES: readonly AppRole[] = ['OPERATOR', 'ADMIN']

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unavailable'

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  isAdmin: boolean
  login: (mobile: string, code: string) => Promise<void>
  logout: () => Promise<void>
  /** Retry a session restore that failed for a transient server/network reason. */
  retrySession: () => Promise<void>
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

  const restore = useCallback(async (): Promise<void> => {
    setStatus('loading')
    const outcome = await authService.restoreSession()
    if (outcome === 'expired') {
      clearSession()
      setStatus('anonymous')
      return
    }
    if (outcome === 'unavailable') {
      // Throttling / 5xx / network failures must not destroy the session.
      // Keep the retry token cookie and offer an explicit retry screen.
      setStatus('unavailable')
      return
    }
    try {
      await loadUser()
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearSession()
        setStatus('anonymous')
        return
      }
      setStatus('unavailable')
    }
  }, [loadUser])

  useEffect(() => {
    void restore()
  }, [restore])

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
      retrySession: restore,
    }),
    [status, user, login, logout, restore],
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
