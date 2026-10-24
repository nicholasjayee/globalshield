// main-world/navigation/service-worker-guard.js
// Intercepts navigator.serviceWorker.register to prevent malicious background service worker hijacking.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;

  window.__SS_MAIN.ServiceWorkerGuard = {
    init() {
      if (!navigator.serviceWorker || !navigator.serviceWorker.register) return;

      const origRegister = navigator.serviceWorker.register;

      const guardedRegister = function (scriptURL, options) {
        if (!Config.isProtectionEnabled('pageGuards')) {
          return origRegister.call(navigator.serviceWorker, scriptURL, options);
        }
        const urlStr = String(scriptURL || '');

        // 1. Block registration of known ad/tracker scripts as service workers
        if (Config.isBlockedHost(urlStr)) {
          console.warn('[SentinelShield] Blocked malicious service worker registration:', urlStr);
          EventBridge.reportHijackBlocked('service-worker-ad-blocked');
          return Promise.reject(new DOMException('Blocked by SentinelShield', 'SecurityError'));
        }

        // 2. DNS rebinding check on service worker script URL
        if (Config.isPrivateNetworkRequest(urlStr)) {
          console.warn('[SentinelShield] Blocked service worker registration to a private address:', urlStr);
          EventBridge.reportPrivateNetworkBlocked('service-worker-private-address');
          return Promise.reject(new DOMException('Blocked by SentinelShield', 'SecurityError'));
        }

        return origRegister.call(navigator.serviceWorker, scriptURL, options);
      };

      try {
        guardedRegister.toString = () => 'function register() { [native code] }';
      } catch (_) {}

      navigator.serviceWorker.register = guardedRegister;
      console.log('[SentinelShield] Service Worker hijacking guard active');
    }
  };
})();
