// main-world/navigation/permission-guard.js
// Neutralizes deceptive notification permission prompts and spam authorization traps.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;

  window.__SS_MAIN.PermissionGuard = {
    init() {
      // If Notification API is present
      if (window.Notification && window.Notification.requestPermission) {
        const origRequestPermission = window.Notification.requestPermission;

        window.Notification.requestPermission = function (callback) {
          if (!Config.isProtectionEnabled('pageGuards')) {
            return origRequestPermission.call(window.Notification, callback);
          }
          // On streaming sites or ad-heavy portals, auto-deny notification traps
          if (Config.isStreamingTarget()) {
            console.warn('[SentinelShield] Blocked deceptive notification permission request');
            EventBridge.reportMaliciousBlocked('notification-trap-denied');
            if (typeof callback === 'function') callback('denied');
            return Promise.resolve('denied');
          }

          return origRequestPermission.call(window.Notification, callback);
        };
      }

      console.log('[SentinelShield] Permission prompt guard active');
    }
  };
})();
