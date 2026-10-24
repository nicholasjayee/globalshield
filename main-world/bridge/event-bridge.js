// main-world/bridge/event-bridge.js
// Safe cross-world event dispatcher connecting main-world hooks to isolated content script.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};

  const safeDispatch = (eventName, detail) => {
    try {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: typeof detail === 'string' ? detail.slice(0, 500) : ''
        })
      );
    } catch (_) {}
  };

  window.__SS_MAIN.EventBridge = {
    reportAdRequestBlocked(url = 'ad-request-blocked', transport = 'fetch') {
      safeDispatch('ss-blocked-ad-request', `${transport}:${url}`);
    },
    reportPopupBlocked(url) {
      safeDispatch('ss-blocked-popup', url);
    },
    reportOverlayBlocked(info = 'overlay-intercepted') {
      safeDispatch('ss-blocked-overlay', info);
    },
    reportScriptBlocked(src = 'ad-script-blocked') {
      safeDispatch('ss-blocked-script', src);
    },
    reportRedirectBlocked(url) {
      safeDispatch('ss-blocked-redirect', url);
    },
    reportTrackersBlocked(info = 'tracker-blocked') {
      safeDispatch('ss-blocked-tracker', info);
    },
    reportFingerprintBlocked(info = 'fingerprint-probed') {
      safeDispatch('ss-blocked-fingerprint', info);
    },
    reportMaliciousBlocked(info = 'malicious-activity-blocked') {
      safeDispatch('ss-blocked-malicious', info);
    },
    reportHijackBlocked(info = 'hijack-attempt-blocked') {
      safeDispatch('ss-blocked-hijack', info);
    },
    reportPrivateNetworkBlocked(info = 'private-network-request-blocked') {
      safeDispatch('ss-blocked-private-network', info);
    },
    reportWebSocketBlocked(url = 'websocket-blocked') {
      safeDispatch('ss-blocked-websocket', url);
    },
    reportSiteInit() {
      safeDispatch('ss-site', location.href);
    }
  };
})();
