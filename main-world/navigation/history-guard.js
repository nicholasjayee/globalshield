// main-world/navigation/history-guard.js
// Prevents back-button trapping, replaceState flooding, hash loops, and unload traps.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { EventBridge } = window.__SS_MAIN;

  const MAX_RAPID_OPERATIONS = 20;
  const TIME_WINDOW_MS = 3000;

  window.__SS_MAIN.HistoryGuard = {
    init() {
      const origPushState = history.pushState;
      const origReplaceState = history.replaceState;
      if (!origPushState) return;

      const timestamps = [];

      const isRateExceeded = () => {
        const now = Date.now();
        while (timestamps.length > 0 && timestamps[0] < now - TIME_WINDOW_MS) {
          timestamps.shift();
        }
        timestamps.push(now);
        return timestamps.length > MAX_RAPID_OPERATIONS;
      };

      // 1. Guard history.pushState
      const guardedPushState = function (state, title, url) {
        if (!window.__SS_MAIN.Config.isProtectionEnabled('pageGuards')) {
          return origPushState.call(this, state, title, url);
        }
        if (isRateExceeded()) {
          console.warn('[SentinelShield] Back-button trap detected: blocked synthetic pushState flood');
          EventBridge.reportHijackBlocked('history-pushstate-trap');
          return;
        }
        return origPushState.call(this, state, title, url);
      };

      // 2. Guard history.replaceState (used to overwrite backward navigation state)
      const guardedReplaceState = function (state, title, url) {
        if (!window.__SS_MAIN.Config.isProtectionEnabled('pageGuards')) {
          return origReplaceState.call(this, state, title, url);
        }
        if (isRateExceeded()) {
          console.warn('[SentinelShield] History trap detected: blocked synthetic replaceState flood');
          EventBridge.reportHijackBlocked('history-replacestate-trap');
          return;
        }
        return origReplaceState.call(this, state, title, url);
      };

      try {
        guardedPushState.toString = () => 'function pushState() { [native code] }';
        guardedReplaceState.toString = () => 'function replaceState() { [native code] }';
      } catch (_) {}

      history.pushState = guardedPushState;
      history.replaceState = guardedReplaceState;

      console.log('[SentinelShield] History back-button trap guard active');
    }
  };
})();
