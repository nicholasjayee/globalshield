// main-world/navigation/redirect-guard.js
// Traps top-level location changes to prevent redirect hijacking to malicious ad hosts.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;

  window.__SS_MAIN.RedirectGuard = {
    init() {
      // 1. Guard Location.prototype.href setter
      try {
        const locProto = Object.getPrototypeOf(window.location);
        const desc = Object.getOwnPropertyDescriptor(locProto, 'href');
        if (desc && desc.set) {
          Object.defineProperty(locProto, 'href', {
            get: desc.get,
            set(v) {
              if (!Config.isProtectionEnabled('pageGuards')) {
                desc.set.call(this, v);
                return;
              }
              if (Config.isBlockedHost(v)) {
                console.warn('[SentinelShield] Blocked location.href redirect:', v);
                EventBridge.reportRedirectBlocked(String(v));
                return;
              }
              desc.set.call(this, v);
            },
            configurable: true
          });
        }
      } catch (_) {
        // Location is non-configurable in some browser modes
      }

      // 2. Guard Location.prototype.assign
      try {
        const locProto = Object.getPrototypeOf(window.location);
        if (locProto && locProto.assign) {
          const origAssign = locProto.assign;
          locProto.assign = function (url) {
            if (!Config.isProtectionEnabled('pageGuards')) {
              return origAssign.call(this, url);
            }
            if (Config.isBlockedHost(url)) {
              console.warn('[SentinelShield] Blocked location.assign redirect:', url);
              EventBridge.reportRedirectBlocked(String(url));
              return;
            }
            return origAssign.call(this, url);
          };
        }
      } catch (_) {}

      // 3. Guard Location.prototype.replace
      try {
        const locProto = Object.getPrototypeOf(window.location);
        if (locProto && locProto.replace) {
          const origReplace = locProto.replace;
          locProto.replace = function (url) {
            if (!Config.isProtectionEnabled('pageGuards')) {
              return origReplace.call(this, url);
            }
            if (Config.isBlockedHost(url)) {
              console.warn('[SentinelShield] Blocked location.replace redirect:', url);
              EventBridge.reportRedirectBlocked(String(url));
              return;
            }
            return origReplace.call(this, url);
          };
        }
      } catch (_) {}

      console.log('[SentinelShield] Redirect guard active');
    }
  };
})();
