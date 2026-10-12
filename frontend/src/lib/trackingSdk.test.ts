import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('InsightTrack browser SDK', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('tracks one initial view, SPA navigation and click with a reused session', async () => {
    const script = readFileSync(resolve(process.cwd(), '..', 'sdk', 'insighttrack.js'), 'utf8');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    window.eval(script);
    const tracker = (window as Window & {
      InsightTrack?: {
        init: (config: { apiUrl: string; websiteId: string; respectDoNotTrack: boolean }) => {
          sessionId: string;
        };
      };
    }).InsightTrack;
    expect(tracker).toBeDefined();
    if (!tracker) throw new Error('SDK did not initialize InsightTrack.');
    const config = {
      apiUrl: 'http://localhost:5000/api',
      websiteId: 'demo-store',
      respectDoNotTrack: false,
      ignorePaths: ['/dashboard'],
    };
    const initialized = tracker.init(config);
    tracker.init(config);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      eventId: expect.any(String),
      websiteId: 'demo-store',
      sessionId: initialized.sessionId,
      eventType: 'page_view',
      pageUrl: window.location.href,
    });

    window.history.pushState({}, '', '/store/products');
    await new Promise((resolveTick) => window.setTimeout(resolveTick, 0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      eventId: expect.any(String),
      sessionId: initialized.sessionId,
      eventType: 'page_view',
      pageUrl: `${window.location.origin}/store/products`,
    });

    const button = document.createElement('button');
    button.textContent = 'Tracked action';
    document.body.appendChild(button);
    button.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: 24,
      clientY: 36,
    }));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toMatchObject({
      eventId: expect.any(String),
      sessionId: initialized.sessionId,
      eventType: 'click',
      pageUrl: `${window.location.origin}/store/products`,
      clickX: 24,
      clickY: 36,
      timestamp: expect.any(String),
      viewportWidth: expect.any(Number),
      viewportHeight: expect.any(Number),
      documentWidth: expect.any(Number),
      documentHeight: expect.any(Number),
    });

    window.history.pushState({}, '', '/dashboard/sessions');
    await new Promise((resolveTick) => window.setTimeout(resolveTick, 0));
    const refreshButton = document.createElement('button');
    refreshButton.textContent = 'Refresh';
    document.body.appendChild(refreshButton);
    refreshButton.click();
    await new Promise((resolveTick) => window.setTimeout(resolveTick, 0));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const returnToProducts = new Promise<void>((resolvePop) => {
      window.addEventListener('popstate', () => resolvePop(), { once: true });
    });
    window.history.back();
    await returnToProducts;
    await new Promise((resolveTick) => window.setTimeout(resolveTick, 0));
    expect(window.location.pathname).toBe('/store/products');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body as string)).toMatchObject({
      eventType: 'page_view',
      pageUrl: `${window.location.origin}/store/products`,
    });
  });
});
