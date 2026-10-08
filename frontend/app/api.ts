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
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
      ? result.error : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return result as T;
}
