// main-world/privacy/anti-adblock-defuser.js
// Neutralizes anti-adblock detection scripts (e.g. BlockAdBlock, FuckAdBlock) by providing inert ad stubs.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};

  window.__SS_MAIN.AntiAdblockDefuser = {
    init() {
      const originalDescriptors = new Map();
      const installedValues = new Map();
      const stubbedProperties = [
        'canRunAds',
        'isAdBlockActive',
        '__hasAdblock',
        'google_ad_status',
        'adsbygoogle',
        'ga',
        'fbq'
      ];
      for (const key of stubbedProperties) {
        originalDescriptors.set(key, Object.getOwnPropertyDescriptor(window, key));
      }

      const restore = () => {
        for (const [key, installedValue] of installedValues) {
          const descriptor = Object.getOwnPropertyDescriptor(window, key);
          if (descriptor?.value !== installedValue) continue;
          const originalDescriptor = originalDescriptors.get(key);
          if (originalDescriptor) Object.defineProperty(window, key, originalDescriptor);
          else delete window[key];
        }
        installedValues.clear();
      };

      const setStub = (key, value) => {
        window[key] = value;
        installedValues.set(key, Object.getOwnPropertyDescriptor(window, key)?.value);
      };

      const apply = (enabled) => {
        if (!enabled) {
          restore();
          return;
        }

        try {
          setStub('canRunAds', true);
          setStub('isAdBlockActive', false);
          setStub('__hasAdblock', false);
          setStub('google_ad_status', 1);

          if (!window.adsbygoogle) {
            const adsbygoogleStub = [];
            adsbygoogleStub.push = function () {
              return adsbygoogleStub.length;
            };
            adsbygoogleStub.loaded = true;
            setStub('adsbygoogle', adsbygoogleStub);
          }

          if (!window.ga) {
            const gaStub = function () {};
            gaStub.loaded = true;
            setStub('ga', gaStub);
          }

          if (!window.fbq) {
            const fbqStub = function () {};
            fbqStub.loaded = true;
            setStub('fbq', fbqStub);
          }

          console.log('[SentinelShield] Anti-adblock defuser stubs initialized');
        } catch (error) {
          console.warn('[SentinelShield] Could not initialize anti-adblock defusers:', error);
        }
      };

      apply(window.__SS_MAIN.Config.isProtectionEnabled('pageGuards'));
      window.addEventListener('ss-device-protection-settings', (event) => {
        if (event.detail?.domain === location.hostname.toLowerCase()) {
          apply(event.detail.pageGuardsEnabled !== false);
        }
      });
    }
  };
})();
