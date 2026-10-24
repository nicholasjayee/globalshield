// main-world/network/fetch-guard.js
// Intercepts window.fetch to block malicious ad endpoints, DNS rebinding probes, and sanitize MovieBox ad-config APIs.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;

  const sanitizeAdConfig = (json) => {
    try {
      if (json && json.data && json.data.adPlans && typeof json.data.adPlans === 'object') {
        for (const key of Object.keys(json.data.adPlans)) {
          const plan = json.data.adPlans[key];
          if (plan && Array.isArray(plan.list)) {
            plan.list = [];
          }
        }
      }
    } catch (_) {}
    return json;
  };

  window.__SS_MAIN.FetchGuard = {
    init() {
      const nativeFetch = window.fetch;
      if (!nativeFetch) return;

      const guardedFetch = async function (input, init) {
        if (!Config.isProtectionEnabled('pageGuards')) {
          return nativeFetch.call(this, input, init);
        }
        const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

        // 1. Direct private-address request check
        if (Config.isPrivateNetworkRequest(url)) {
          console.warn('[SentinelShield] Blocked fetch request to a private address:', url);
          EventBridge.reportPrivateNetworkBlocked('fetch-private-address');
          return Promise.reject(new DOMException('Blocked by SentinelShield (private network request)', 'SecurityError'));
        }

        // 2. MovieBox / aoneroom ad config sanitization
        if (Config.isAdConfig(url)) {
          let response;
          try {
            response = await nativeFetch.call(this, input, init);
            if (!response || !response.ok) return response;

            const cloned = response.clone();
            const json = await cloned.json();
            sanitizeAdConfig(json);

            console.warn('[SentinelShield] Sanitized MovieBox ad/get-config response (ad plans emptied)');
            EventBridge.reportScriptBlocked('ad-config-sanitized');

            return new Response(JSON.stringify(json), {
              status: response.status,
              statusText: response.statusText,
              headers: {
                'Content-Type': 'application/json; charset=utf-8'
              }
            });
          } catch (error) {
            console.warn('[SentinelShield] Could not sanitize ad config response:', error);
            if (response) return response;
            throw error;
          }
        }

        // 3. High-confidence blocked host interception
        if (Config.isBlockedHost(url)) {
          console.warn('[SentinelShield] Blocked fetch ad request:', url);
          if (window.__SS_MAIN.RequestTracker) {
            window.__SS_MAIN.RequestTracker.recordBlockedRequest(url, 'fetch');
          } else {
            EventBridge.reportAdRequestBlocked(url, 'fetch');
          }
          return Promise.reject(new Error('Blocked by SentinelShield'));
        }

        return nativeFetch.call(this, input, init);
      };

      try {
        guardedFetch.toString = () => 'function fetch() { [native code] }';
      } catch (_) {}

      window.fetch = guardedFetch;
      console.log('[SentinelShield] Fetch guard active');
    }
  };
})();
