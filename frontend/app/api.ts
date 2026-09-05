/// <reference types="vite/client" />
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, credentials: 'include' });
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await apiFetch(`${API_URL}${path}`, {
    method,
    ...(method !== 'GET' ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result as T;
}
