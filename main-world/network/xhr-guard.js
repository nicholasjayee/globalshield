// main-world/network/xhr-guard.js
// Intercepts XMLHttpRequest to block malicious ad endpoints, DNS rebinding probes, and sanitize ad config requests.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;

  const sanitizeAdConfig = (json) => {
    try {
      if (json && json.data && json.data.adPlans && typeof json.data.adPlans === 'object') {
        for (const key of Object.keys(json.data.adPlans)) {
          const plan = json.data.adPlans[key];
          if (plan && Array.isArray(plan.list)) plan.list = [];
        }
      }
    } catch (_) {}
    return json;
  };

  window.__SS_MAIN.XhrGuard = {
    init() {
      const nativeOpen = XMLHttpRequest.prototype.open;
      const nativeSend = XMLHttpRequest.prototype.send;
      if (!nativeOpen || !nativeSend) return;

      const guardedOpen = function (method, url, ...rest) {
        if (!Config.isProtectionEnabled('pageGuards')) {
          return nativeOpen.call(this, method, url, ...rest);
        }
        this.__ss_url = url;
        const urlStr = String(url || '');

        // 1. Direct private-address request check
        if (Config.isPrivateNetworkRequest(urlStr)) {
          console.warn('[SentinelShield] Blocked XHR request to a private address:', urlStr);
          EventBridge.reportPrivateNetworkBlocked('xhr-private-address');
          return nativeOpen.call(this, method, 'about:blank', ...rest);
        }

        // 2. High-confidence ad/tracker host block
        if (Config.isBlockedHost(urlStr)) {
          console.warn('[SentinelShield] Blocked XHR ad request:', urlStr);
          if (window.__SS_MAIN.RequestTracker) {
            window.__SS_MAIN.RequestTracker.recordBlockedRequest(urlStr, 'xhr');
          } else {
            EventBridge.reportAdRequestBlocked(urlStr, 'xhr');
          }
          return nativeOpen.call(this, method, 'about:blank', ...rest);
        }

        return nativeOpen.call(this, method, url, ...rest);
      };

      const guardedSend = function (body) {
        if (!Config.isProtectionEnabled('pageGuards')) {
          return nativeSend.call(this, body);
        }
        if (this.__ss_url && Config.isAdConfig(this.__ss_url)) {
          this.addEventListener('readystatechange', () => {
            if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
              try {
                const parsed = JSON.parse(this.responseText);
                sanitizeAdConfig(parsed);
                const sanitizedStr = JSON.stringify(parsed);
                Object.defineProperty(this, 'responseText', { value: sanitizedStr });
                Object.defineProperty(this, 'response', { value: sanitizedStr });
                EventBridge.reportScriptBlocked('ad-config-sanitized-xhr');
              } catch (_) {}
            }
          });
        }
        return nativeSend.call(this, body);
      };

      try {
        guardedOpen.toString = () => 'function open() { [native code] }';
        guardedSend.toString = () => 'function send() { [native code] }';
      } catch (_) {}

      XMLHttpRequest.prototype.open = guardedOpen;
      XMLHttpRequest.prototype.send = guardedSend;

      console.log('[SentinelShield] XHR guard active');
    }
  };
})();
