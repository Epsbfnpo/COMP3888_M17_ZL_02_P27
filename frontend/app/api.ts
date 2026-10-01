/// <reference types="vite/client" />

export const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  return fetch(input, {
    ...init,
    credentials: 'include',
  });
}

export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  const response = await apiFetch(`${API_URL}${path}`, {
    method,
    ...(method !== 'GET'
      ? {
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body ?? {}),
        }
      : {}),
  });

  let result: any;

  try {
    result = await response.json();
  } catch {
    result = null;
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      result?.error || 'Request failed'
    );
  }

  return result as T;
}