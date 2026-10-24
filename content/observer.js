// content/observer.js
// Orchestrates DOM lifecycle observing, mutation handling, watchdog sweeping, and SPA routing.

(() => {
  'use strict';

  window.__SS_CONTENT = window.__SS_CONTENT || {};
  const { CosmeticCleaner } = window.__SS_CONTENT;

  window.__SS_CONTENT.Observer = {
    init() {
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              CosmeticCleaner.sweep(node);
            }
          }
        }
      });
      let watchdog = null;
      let enabled = false;

      const startObserving = () => {
        if (enabled) return;
        enabled = true;
        CosmeticCleaner.sweep(document);
        observer.observe(document, {
          childList: true,
          subtree: true
        });
        let ticks = 0;
        watchdog = setInterval(() => {
          CosmeticCleaner.sweep(document);
          if (++ticks >= 20) {
            clearInterval(watchdog);
            watchdog = null;
          }
        }, 1000);
      };

      const stopObserving = () => {
        if (!enabled) return;
        enabled = false;
        observer.disconnect();
        if (watchdog) clearInterval(watchdog);
        watchdog = null;
      };

      const wrapHistory = (fn) => function (...args) {
        const res = fn.apply(this, args);
        if (enabled) setTimeout(() => CosmeticCleaner.sweep(document), 0);
        return res;
      };

      try {
        history.pushState = wrapHistory(history.pushState);
        history.replaceState = wrapHistory(history.replaceState);
      } catch (_) {}

      window.addEventListener('popstate', () => {
        if (enabled) setTimeout(() => CosmeticCleaner.sweep(document), 0);
      });

      chrome.runtime.onMessage.addListener((message) => {
        if (message?.type !== 'ss-cosmetic-setting') return false;
        if (message.enabled === true) startObserving();
        else if (message.enabled === false) stopObserving();
        return false;
      });

      const startWithStoredSetting = () => {
        chrome.storage.local.get('ss_protection_settings', (stored) => {
          const value = stored.ss_protection_settings || {};
          let domain = '';
          try {
            domain = new URL(location.href).hostname.toLowerCase();
          } catch (_) {}
          const globalEnabled = value.cosmeticFiltering !== false;
          const siteEnabled = domain && value.siteCosmetic &&
            Object.hasOwn(value.siteCosmetic, domain)
            ? value.siteCosmetic[domain] === true
            : globalEnabled;
          if (siteEnabled) startObserving();
          else stopObserving();
        });
      };

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes.ss_protection_settings) return;
        startWithStoredSetting();
      });

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startWithStoredSetting, { once: true });
      } else {
        startWithStoredSetting();
      }
      console.log('[SentinelShield] DOM observer initialized');
    }
  };
})();
