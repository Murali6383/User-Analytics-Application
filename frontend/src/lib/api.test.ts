import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE, apiFetch } from './api';

describe('dashboard API requests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('deduplicates concurrent StrictMode GETs and does not write analytics events', async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);

    const path = `/sessions?websiteId=dedupe-test-${Date.now()}`;
    const first = apiFetch<{ data: unknown[] }>(path);
    const second = apiFetch<{ data: unknown[] }>(path);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}${path}`);
    expect(fetchMock.mock.calls[0][1]?.cache).toBe('no-store');
    expect(fetchMock.mock.calls[0][1]?.method || 'GET').toBe('GET');

    resolveResponse?.({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);
    await expect(Promise.all([first, second])).resolves.toEqual([{ data: [] }, { data: [] }]);
  });
});
