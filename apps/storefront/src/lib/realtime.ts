import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from './api';
import { getAccessToken } from './auth-client';

/** Authenticated storefront realtime client (SS-900). */
export function realtimeOrigin(): string {
  const url = new URL(API_BASE_URL, window.location.origin);
  return url.origin;
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
  });
}
