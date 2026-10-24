// main-world/network/beacon-guard.js
// Intercepts navigator.sendBeacon to prevent background tracking telemetry and ad-click reporting.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;

  const isTrackingBeacon = (url) => {
    if (!url) return false;
    const str = String(url);
    if (Config.isBlockedHost(str)) return true;

    return (
      str.includes('/collect') ||
      str.includes('/telemetry') ||
      str.includes('/analytics') ||
      str.includes('/log_event') ||
      str.includes('stats.g.doubleclick.net')
    );
  };

  window.__SS_MAIN.BeaconGuard = {
    init() {
      if (!navigator.sendBeacon) return;

      const nativeSendBeacon = navigator.sendBeacon;
      navigator.sendBeacon = function (url, data) {
        if (!Config.isProtectionEnabled('pageGuards')) {
          return nativeSendBeacon.call(this, url, data);
        }
        if (isTrackingBeacon(url)) {
          console.warn('[SentinelShield] Blocked background tracking beacon:', url);
          if (window.__SS_MAIN.RequestTracker) {
            window.__SS_MAIN.RequestTracker.recordBlockedRequest(url, 'beacon');
          } else {
            EventBridge.reportAdRequestBlocked(url, 'beacon');
          }
          return false;
        }
        return nativeSendBeacon.call(this, url, data);
      };

      console.log('[SentinelShield] Beacon telemetry guard active');
    }
  };
})();
