// content/stats-reporter.js
// Collects and batches block events from main-world and cosmetic cleaner, reporting them to background.

(() => {
  'use strict';

  window.__SS_CONTENT = window.__SS_CONTENT || {};

  const pending = {
    ad_requests: 0,
    ad_elements: 0,
    trackers: 0,
    fingerprinters: 0,
    privacy: 0,
    malicious: 0,
    popups: 0,
    scripts: 0,
    overlays: 0,
    private_network: 0,
    hijack: 0
  };

  let flushTimer = null;

  const flush = () => {
    flushTimer = null;
    for (const category of Object.keys(pending)) {
      const n = pending[category];
      if (n <= 0) continue;
      pending[category] = 0;

      try {
        chrome.runtime.sendMessage(
          { type: 'ss-stat', category, count: n },
          () => { void chrome.runtime.lastError; }
        );
      } catch (_) {
        // Extension context invalidated (e.g. reload)
      }
    }
  };

  const bump = (category, count = 1) => {
    if (!(category in pending)) return;
    pending[category] += (typeof count === 'number' && count > 0) ? count : 1;
    if (!flushTimer) {
      flushTimer = setTimeout(flush, 80);
    }
  };

  window.__SS_CONTENT.StatsReporter = {
    bump,

    init() {
      // ── Listen for custom events from main-world hooks ──
      window.addEventListener('ss-blocked-ad-request', () => bump('ad_requests'));
      window.addEventListener('ss-blocked-websocket', () => bump('ad_requests'));
      window.addEventListener('ss-blocked-popup', () => bump('popups'));
      window.addEventListener('ss-blocked-overlay', () => bump('overlays'));
      window.addEventListener('ss-blocked-script', () => bump('scripts'));
      window.addEventListener('ss-blocked-redirect', () => bump('malicious'));
      window.addEventListener('ss-blocked-tracker', () => bump('trackers'));
      window.addEventListener('ss-blocked-fingerprint', () => bump('fingerprinters'));
      window.addEventListener('ss-blocked-malicious', () => bump('malicious'));
      window.addEventListener('ss-blocked-hijack', () => bump('hijack'));
      window.addEventListener('ss-blocked-private-network', () => bump('private_network'));

      // Backward-compatibility events for moviebox scripts if any
      window.addEventListener('mb-blocked-popup', () => bump('popups'));
      window.addEventListener('mb-blocked-script', () => bump('scripts'));

      // Report active tab URL on boot (only from top frame to avoid iframe identity pollution)
      try {
        if (window === window.top) {
          chrome.runtime.sendMessage(
            { type: 'ss-site', url: location.href },
            () => { void chrome.runtime.lastError; }
          );
        }
      } catch (_) {}
    }
  };
})();
