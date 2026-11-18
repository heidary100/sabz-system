import { io, type Socket } from 'socket.io-client'
import { API_BASE_URL, getAccessToken } from '../services/api'

/**
 * Authenticated realtime client (SS-900). The access token is sent in the
 * Socket.IO handshake auth payload (never a query string). Reconnection uses
 * the latest token from the API service; the server re-verifies every
 * connection and derives rooms from the authenticated user/roles.
 */
export function realtimeOrigin(): string {
  const url = new URL(API_BASE_URL, window.location.origin)
  return url.origin
}

export function connectRealtime(): Socket {
  return io(`${realtimeOrigin()}/ws`, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token: getAccessToken() },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 15_000,
    timeout: 10_000,
    withCredentials: true,
  })
}
