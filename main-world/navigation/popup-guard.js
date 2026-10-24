// main-world/navigation/popup-guard.js
// Traps window.open to stop pop-unders, blank redirects, reverse tabnabbing, and ad launches.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;

  window.__SS_MAIN.PopupGuard = {
    init() {
      const realOpen = window.open;
      if (!realOpen) return;

      const guardedOpen = function (url, ...rest) {
        if (!Config.isProtectionEnabled('pageGuards')) {
          return realOpen.call(window, url, ...rest);
        }
        const urlStr = url ? String(url).trim() : '';

        // 1. Direct private-address request check
        if (Config.isPrivateNetworkRequest(urlStr)) {
          console.warn('[SentinelShield] Blocked popup to a private address:', urlStr);
          EventBridge.reportPrivateNetworkBlocked('popup-private-address');
          return null;
        }

        // about:blank is used by legitimate login and payment flows; only block active-content URLs.
        const isSuspicious =
          urlStr.startsWith('javascript:') ||
          urlStr.startsWith('data:text/html') ||
          Config.isBlockedHost(urlStr);

        if (isSuspicious) {
          console.warn('[SentinelShield] Popup blocked:', urlStr || '(blank popunder)');
          EventBridge.reportPopupBlocked(urlStr || 'blank-popunder');
          return null;
        }

        const newWin = realOpen.call(window, url, ...rest);

        // 3. Neutralize Reverse Tabnabbing (prevent newly opened window from navigating opener)
        if (newWin) {
          try {
            newWin.opener = null;
          } catch (_) {}
        }

        return newWin;
      };

      try {
        guardedOpen.toString = () => 'function open() { [native code] }';
      } catch (_) {}

      window.open = guardedOpen;
      console.log('[SentinelShield] Popup & reverse-tabnabbing guard active');
    }
  };
})();
