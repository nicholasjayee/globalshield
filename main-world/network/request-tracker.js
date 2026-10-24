// main-world/network/request-tracker.js
// Dedicated tracking and categorization logic for intercepted network ad requests.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { EventBridge } = window.__SS_MAIN;

  const sessionNetworkStats = {
    fetch: 0,
    xhr: 0,
    websocket: 0,
    beacon: 0
  };

  const blockedHostTally = new Map();

  const extractHost = (url) => {
    try {
      return new URL(String(url), location.href).hostname;
    } catch (_) {
      return String(url || '').slice(0, 50);
    }
  };

  window.__SS_MAIN.RequestTracker = {
    recordBlockedRequest(url, transport = 'fetch') {
      const type = (transport in sessionNetworkStats) ? transport : 'fetch';
      sessionNetworkStats[type]++;

      const host = extractHost(url);
      blockedHostTally.set(host, (blockedHostTally.get(host) || 0) + 1);

      // Report specifically as ad_requests
      if (EventBridge && EventBridge.reportAdRequestBlocked) {
        EventBridge.reportAdRequestBlocked(url, type);
      } else if (EventBridge && EventBridge.reportScriptBlocked) {
        EventBridge.reportScriptBlocked(url);
      }
    },

    getNetworkStats() {
      return {
        transports: { ...sessionNetworkStats },
        topHosts: Object.fromEntries(blockedHostTally)
      };
    }
  };
})();
