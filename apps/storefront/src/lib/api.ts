import type { ApiErrorPayload } from '@sabz/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload?: ApiErrorPayload,
  ) {
    super(payload?.message ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as ApiErrorPayload | undefined;
    throw new ApiError(response.status, payload);
  }

  return (await response.json()) as T;
}
