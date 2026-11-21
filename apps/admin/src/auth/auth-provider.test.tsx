// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => {
  class MockApiError extends Error {
    status: number
    constructor(status: number) {
      super('api error')
      this.status = status
    }
  }
  return {
    ApiError: MockApiError,
    clearSession: vi.fn(),
    onAuthStateChange: vi.fn(() => () => undefined),
    setAccessToken: vi.fn(),
  }
})

vi.mock('../services/auth', () => ({
  restoreSession: vi.fn(),
  getMe: vi.fn(),
  verifyOtp: vi.fn(),
  logout: vi.fn(),
}))

import { ApiError, clearSession } from '../services/api'
import * as authService from '../services/auth'
import { AuthProvider, useAuth } from './auth-provider'

const restoreSession = vi.mocked(authService.restoreSession)
const getMe = vi.mocked(authService.getMe)
const clearSessionMock = vi.mocked(clearSession)

function Probe() {
  const { status, retrySession } = useAuth()
  return (
    <div>
      <span data-testid="auth-status">{status}</span>
      <button type="button" onClick={() => void retrySession()}>
        retry
      </button>
    </div>
  )
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getMe.mockResolvedValue({
    id: 'user-1',
    mobile: '09170000001',
    status: 'ACTIVE',
    roles: ['ADMIN'],
  } as never)
})

afterEach(() => cleanup())

describe('AuthProvider refresh resilience (SS-900 final)', () => {
  it('shows a retry state instead of clearing the session on a transient refresh failure', async () => {
    restoreSession.mockResolvedValue('unavailable')
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('auth-status').textContent).toBe('unavailable'),
    )
    expect(clearSessionMock).not.toHaveBeenCalled()

    restoreSession.mockResolvedValue('refreshed')
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    await waitFor(() =>
      expect(screen.getByTestId('auth-status').textContent).toBe('authenticated'),
    )
  })

  it('clears the session only for an explicit refresh rejection', async () => {
    restoreSession.mockResolvedValue('expired')
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('auth-status').textContent).toBe('anonymous'),
    )
    expect(clearSessionMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the retry state when the profile read fails transiently', async () => {
    restoreSession.mockResolvedValue('refreshed')
    getMe.mockRejectedValue(new ApiError(503))
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('auth-status').textContent).toBe('unavailable'),
    )
    expect(clearSessionMock).not.toHaveBeenCalled()
  })

  it('clears the session when the refreshed profile read is rejected', async () => {
    restoreSession.mockResolvedValue('refreshed')
    getMe.mockRejectedValue(new ApiError(401))
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('auth-status').textContent).toBe('anonymous'),
    )
    expect(clearSessionMock).toHaveBeenCalledTimes(1)
  })
})
