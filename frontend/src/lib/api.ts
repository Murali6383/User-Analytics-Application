export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const inFlightGets = new Map<string, Promise<unknown>>();

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase();
  const url = `${API_BASE}${path}`;
  const requestKey = `${method}:${url}`;
  if (method === 'GET') {
    const existingRequest = inFlightGets.get(requestKey);
    if (existingRequest) return existingRequest as Promise<T>;
  }

  const request = fetch(url, {
    ...init,
    cache: method === 'GET' ? 'no-store' : init?.cache,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  }).then(async (response) => {
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error || 'Request failed');
    }

    return response.json() as Promise<T>;
  });

  if (method !== 'GET') return request;

  inFlightGets.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (inFlightGets.get(requestKey) === request) {
      inFlightGets.delete(requestKey);
    }
  }
}
