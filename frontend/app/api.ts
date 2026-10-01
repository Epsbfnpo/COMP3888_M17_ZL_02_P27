/// <reference types="vite/client" />
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, credentials: 'include' });
}

export async function api<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(`${API_URL}${path}`, {
    method,
    signal,
    ...(method !== 'GET' ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error || 'Request failed', response.status);
  return result as T;
}
