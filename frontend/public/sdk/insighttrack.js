(function () {
  function createUuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (char) {
      const random = (Math.random() * 16) | 0;
      const value = char === 'x' ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function getSessionStorageValue(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function setSessionStorageValue(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Ignore storage errors; cookie fallback remains.
    }
  }

  function readSessionId() {
    const stored = getSessionStorageValue('insighttrack_session_id');
    if (stored) return stored;

    const cookie = document.cookie
      .split('; ')
      .map((entry) => entry.split('='))
      .find(([name]) => name === 'insighttrack_session');

    return cookie ? decodeURIComponent(cookie[1]) : null;
  }

  function writeSessionId(sessionId) {
    setSessionStorageValue('insighttrack_session_id', sessionId);
    const expires = new Date(Date.now() + 30 * 60 * 1000).toUTCString();
    document.cookie = `insighttrack_session=${encodeURIComponent(sessionId)}; path=/; expires=${expires}; SameSite=Lax`;
  }

  function getSessionAgeMs() {
    const value = getSessionStorageValue('insighttrack_session_last_seen');
    if (!value) return Number.POSITIVE_INFINITY;
    const lastSeen = Number(value);
    return Number.isFinite(lastSeen) ? Date.now() - lastSeen : Number.POSITIVE_INFINITY;
  }

  function ensureSession() {
    const sessionId = readSessionId();
    const maxAgeMs = 30 * 60 * 1000;
    const expired = getSessionAgeMs() > maxAgeMs;

    if (!sessionId || expired) {
      const fresh = createUuid();
      writeSessionId(fresh);
      setSessionStorageValue('insighttrack_session_last_seen', String(Date.now()));
      return fresh;
    }

    setSessionStorageValue('insighttrack_session_last_seen', String(Date.now()));
    return sessionId;
  }

  function isOptedOut() {
    return getSessionStorageValue('insighttrack_opt_out') === 'true';
  }

  function setOptOut(value) {
    setSessionStorageValue('insighttrack_opt_out', String(Boolean(value)));
  }

  function validatePayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (!payload.websiteId || !payload.sessionId || !payload.pageUrl || !payload.timestamp) return false;
    if (!['page_view', 'click'].includes(payload.eventType)) return false;
    if (payload.eventType === 'click') {
      const clickX = Number(payload.clickX);
      const clickY = Number(payload.clickY);
      if (!Number.isFinite(clickX) || !Number.isFinite(clickY) || clickX < 0 || clickY < 0) return false;
    }
    return true;
  }

  function buildEventPayload(config, eventType, extra = {}) {
    const payload = {
      websiteId: config.websiteId,
      sessionId: config.sessionId,
      eventType,
      pageUrl: window.location.href,
      timestamp: new Date().toISOString(),
      viewportWidth: window.innerWidth || 0,
      viewportHeight: window.innerHeight || 0,
      documentWidth: Math.max(document.documentElement.scrollWidth || 0, document.body ? document.body.scrollWidth : 0),
      documentHeight: Math.max(document.documentElement.scrollHeight || 0, document.body ? document.body.scrollHeight : 0),
      pageTitle: document.title || '',
      ...extra,
    };

    if (eventType === 'click') {
      payload.clickX = Number(extra.clickX);
      payload.clickY = Number(extra.clickY);
    }

    return payload;
  }

  function sendPayload(config, payload) {
    const body = JSON.stringify(payload);
    const url = `${config.apiUrl.replace(/\/$/, '')}/events`;

    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      if (ok) return Promise.resolve({ ok: true });
    }

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).then((response) => ({ ok: response.ok, status: response.status })).catch((error) => {
      console.warn('InsightTrack: request failed.', error);
      return { ok: false, error };
    });
  }

  function createInstance() {
    const state = { config: null, initialized: false, listenerAttached: false };

    function createConfig(config = {}) {
      const defaultConfig = {
        apiUrl: 'http://localhost:5000/api',
        websiteId: 'default-site',
        respectDoNotTrack: false,
        optOut: false,
      };

      const merged = { ...defaultConfig, ...config };
      if (merged.respectDoNotTrack && navigator.doNotTrack === '1') {
        setOptOut(true);
      }

      if (merged.optOut || isOptedOut()) {
        return { ...merged, enabled: false, sessionId: null };
      }

      return {
        ...merged,
        enabled: true,
        sessionId: ensureSession(),
      };
    }

    function attachClickListener() {
      if (state.listenerAttached || !state.config || !state.config.enabled) return;
      state.listenerAttached = true;

      document.addEventListener(
        'click',
        (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest('[data-insighttrack-ignore]')) return;

          const element = target.closest('a, button, input, select, textarea, [data-insighttrack-id]');
          if (!element) return;

          const clickX = typeof event.clientX === 'number' ? event.clientX : 0;
          const clickY = typeof event.clientY === 'number' ? event.clientY : 0;
          if (clickX < 0 || clickY < 0) return;

          const payload = buildEventPayload(state.config, 'click', {
            clickX,
            clickY,
            elementTag: element.tagName || '',
            elementId: element.id || element.getAttribute('data-insighttrack-id') || '',
          });

          if (!validatePayload(payload)) return;
          sendPayload(state.config, payload).catch(() => undefined);
        },
        { passive: true },
      );
    }

    function trackPageView() {
      if (!state.config || !state.config.enabled) return;
      const payload = buildEventPayload(state.config, 'page_view');
      if (!validatePayload(payload)) return;
      sendPayload(state.config, payload).catch(() => undefined);
    }

    return {
      init(config = {}) {
        if (state.initialized && state.config) {
          return state.config;
        }

        try {
          state.initialized = true;
          state.config = createConfig(config);
          attachClickListener();
          trackPageView();
          return state.config;
        } catch (error) {
          console.warn('InsightTrack initialization failed safely.', error);
          state.initialized = true;
          state.config = { ...config, enabled: false, sessionId: null };
          return state.config;
        }
      },
      trackPageView,
      optOut() {
        setOptOut(true);
        if (state.config) state.config.enabled = false;
      },
      optIn() {
        setOptOut(false);
        if (!state.config) {
          state.config = createConfig({});
        }
        if (state.config) state.config.enabled = true;
      },
      isOptedOut() {
        return isOptedOut();
      },
      getConfig() {
        return state.config;
      },
      reset() {
        setSessionStorageValue('insighttrack_session_id', '');
        setSessionStorageValue('insighttrack_session_last_seen', '');
        state.listenerAttached = false;
      },
    };
  }

  const global = typeof window !== 'undefined' ? window : globalThis;
  if (!global.InsightTrack) {
    global.InsightTrack = createInstance();
  }
})();
