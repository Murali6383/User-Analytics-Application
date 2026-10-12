(function () {
  const SESSION_KEY = 'insighttrack_session_id';
  const LAST_SEEN_KEY = 'insighttrack_session_last_seen';
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  const SENSITIVE_QUERY_KEYS = /(?:token|auth|password|passwd|email|phone|mobile|ssn|secret|code|api[_-]?key|jwt|user(?:name|id)?|customer(?:name|id)?|first[_-]?name|last[_-]?name|address|birth(?:day|date)?|dob|postal|zip)/i;

  function createUuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (char) {
      const random = (Math.random() * 16) | 0;
      const value = char === 'x' ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function storageGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('InsightTrack: session storage is unavailable.', error);
      }
    }
  }

  function canonicalPageUrl(value) {
    const url = new URL(value, window.location.href);
    url.hash = '';
    if (url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.test(key)) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    return url.href;
  }

  function readSessionId() {
    const stored = storageGet(SESSION_KEY);
    if (stored) return stored;

    const entry = document.cookie
      .split(';')
      .map((part) => part.trim().split('='))
      .find(([name]) => name === 'insighttrack_session');
    if (!entry) return null;

    try {
      return decodeURIComponent(entry.slice(1).join('='));
    } catch {
      return null;
    }
  }

  function writeSessionId(sessionId) {
    storageSet(SESSION_KEY, sessionId);
    const expires = new Date(Date.now() + SESSION_TIMEOUT_MS).toUTCString();
    document.cookie = `insighttrack_session=${encodeURIComponent(sessionId)}; path=/; expires=${expires}; SameSite=Lax`;
  }

  function ensureSession() {
    const lastSeen = Number(storageGet(LAST_SEEN_KEY));
    const expired = !Number.isFinite(lastSeen) || Date.now() - lastSeen > SESSION_TIMEOUT_MS;
    const sessionId = readSessionId();
    const activeSessionId = sessionId && !expired ? sessionId : createUuid();
    writeSessionId(activeSessionId);
    storageSet(LAST_SEEN_KEY, String(Date.now()));
    return activeSessionId;
  }

  function isDoNotTrackEnabled() {
    return navigator.doNotTrack === '1'
      || navigator.doNotTrack === 'yes'
      || window.doNotTrack === '1'
      || window.doNotTrack === 'yes';
  }

  function createInstance() {
    const state = {
      config: null,
      listenerAttached: false,
      historyPatched: false,
      lastPageUrl: null,
      lastPageTrackedAt: 0,
    };

    function isIgnoredPage() {
      const pathname = window.location.pathname;
      return (state.config.ignorePaths || []).some((path) => (
        pathname === path || pathname.startsWith(`${path.replace(/\/$/, '')}/`)
      ));
    }

    function reportFailure(message, error) {
      if (state.config && state.config.development && typeof console !== 'undefined') {
        console.error(`InsightTrack: ${message}`, error);
      }
    }

    function buildEventPayload(eventType, extra = {}) {
      const payload = {
        websiteId: state.config.websiteId,
        sessionId: state.config.sessionId,
        eventType,
        pageUrl: canonicalPageUrl(window.location.href),
        timestamp: new Date().toISOString(),
      };

      if (eventType === 'click') {
        const documentWidth = Math.max(
          document.documentElement.scrollWidth,
          document.documentElement.clientWidth,
          window.innerWidth || 0,
        );
        const documentHeight = Math.max(
          document.documentElement.scrollHeight,
          document.documentElement.clientHeight,
          window.innerHeight || 0,
        );
        payload.clickX = Math.max(0, Math.round(extra.pageX));
        payload.clickY = Math.max(0, Math.round(extra.pageY));
        payload.viewportWidth = Math.max(0, window.innerWidth || 0);
        payload.viewportHeight = Math.max(0, window.innerHeight || 0);
        payload.documentWidth = documentWidth;
        payload.documentHeight = documentHeight;
        payload.elementTag = extra.elementTag;
      }

      return payload;
    }

    async function sendPayload(payload) {
      try {
        const response = await fetch(`${state.config.apiUrl.replace(/\/$/, '')}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
          credentials: 'omit',
        });
        if (!response.ok) {
          const detail = await response.text();
          reportFailure(`event request failed with HTTP ${response.status}.`, detail);
        }
        return response.ok;
      } catch (error) {
        reportFailure('event request failed.', error);
        return false;
      }
    }

    function trackPageView() {
      if (!state.config || !state.config.enabled || isIgnoredPage()) return;
      let pageUrl;
      try {
        pageUrl = canonicalPageUrl(window.location.href);
      } catch (error) {
        reportFailure('could not determine the current page URL.', error);
        return;
      }

      if (pageUrl === state.lastPageUrl && Date.now() - state.lastPageTrackedAt < 100) return;
      state.lastPageUrl = pageUrl;
      state.lastPageTrackedAt = Date.now();
      void sendPayload(buildEventPayload('page_view'));
    }

    function attachClickListener() {
      if (state.listenerAttached || !state.config.enabled) return;
      state.listenerAttached = true;
      document.addEventListener('click', (event) => {
        if (!state.config || !state.config.enabled || isIgnoredPage()) return;
        if (!(event.target instanceof Element)) return;
        const element = event.target.closest('a, button, [data-insighttrack-id]');
        if (!element || element.closest('[data-insighttrack-ignore], [data-insighttrack-sensitive], form, [contenteditable="true"]')) return;
        if (element instanceof HTMLButtonElement && element.type === 'submit' && element.form) return;

        const payload = buildEventPayload('click', {
          pageX: Number.isFinite(event.pageX) ? event.pageX : event.clientX + window.scrollX,
          pageY: Number.isFinite(event.pageY) ? event.pageY : event.clientY + window.scrollY,
          elementTag: element.tagName.toLowerCase(),
        });
        void sendPayload(payload);
      }, { passive: true });
    }

    function attachNavigationListeners() {
      if (state.historyPatched) return;
      state.historyPatched = true;

      const trackNavigation = () => {
        Promise.resolve().then(trackPageView);
      };
      window.addEventListener('popstate', trackNavigation);
      window.addEventListener('hashchange', trackNavigation);
      window.addEventListener('insighttrack:navigate', trackNavigation);

      for (const method of ['pushState', 'replaceState']) {
        const original = window.history[method];
        window.history[method] = function () {
          const result = original.apply(this, arguments);
          trackNavigation();
          return result;
        };
      }
    }

    return {
      init(config = {}) {
        if (state.config) return state.config;

        try {
          const merged = {
            apiUrl: 'http://localhost:5000/api',
            websiteId: 'default-site',
            respectDoNotTrack: true,
            development: false,
            ...config,
          };
          const apiUrl = new URL(merged.apiUrl, window.location.href);
          if (typeof merged.websiteId !== 'string' || !merged.websiteId.trim() || !['http:', 'https:'].includes(apiUrl.protocol)) {
            throw new Error('A websiteId and absolute HTTP(S) apiUrl are required.');
          }
          merged.websiteId = merged.websiteId.trim();
          merged.apiUrl = apiUrl.href.replace(/\/$/, '');
          const optedOut = storageGet('insighttrack_opt_out') === 'true';
          const disabledByDnt = merged.respectDoNotTrack && isDoNotTrackEnabled();
          state.config = {
            ...merged,
            enabled: !merged.optOut && !optedOut && !disabledByDnt,
            sessionId: null,
          };

          if (state.config.enabled) {
            state.config.sessionId = ensureSession();
            attachClickListener();
            attachNavigationListeners();
            trackPageView();
          }
          return state.config;
        } catch (error) {
          reportFailure('initialization failed.', error);
          state.config = { ...config, enabled: false, sessionId: null };
          return state.config;
        }
      },
      trackPageView,
      optOut() {
        storageSet('insighttrack_opt_out', 'true');
        if (state.config) state.config.enabled = false;
      },
      optIn() {
        storageSet('insighttrack_opt_out', 'false');
        if (!state.config) {
          return this.init();
        }
        if (!state.config.sessionId) state.config.sessionId = ensureSession();
        state.config.enabled = !(state.config.respectDoNotTrack && isDoNotTrackEnabled());
        if (!state.config.enabled) return state.config;
        attachClickListener();
        attachNavigationListeners();
        trackPageView();
        return state.config;
      },
      isOptedOut() {
        return storageGet('insighttrack_opt_out') === 'true'
          || Boolean(state.config && state.config.respectDoNotTrack && isDoNotTrackEnabled());
      },
      getConfig() {
        return state.config;
      },
    };
  }

  if (typeof window !== 'undefined' && !window.InsightTrack) {
    window.InsightTrack = createInstance();
  }
})();
