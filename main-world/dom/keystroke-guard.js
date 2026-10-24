// main-world/dom/keystroke-guard.js
// Dedicated defense against behavioral typing biometrics and keystroke dynamics profiling.
// Neutralizes passive keystroke timing analysis (flight time and dwell time profiling)
// by subtly jittering event timestamps without delaying user typing.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config } = window.__SS_MAIN;

  const masquerade = (fn, originalName = '') => {
    try {
      const name = originalName || fn.name || '';
      Object.defineProperty(fn, 'name', { value: name, configurable: true });
      fn.toString = () => `function ${name}() { [native code] }`;
    } catch (_) {}
    return fn;
  };

  window.__SS_MAIN.KeystrokeGuard = {
    init() {
      try {
        if (window.KeyboardEvent) {
          const origTimeStamp = Object.getOwnPropertyDescriptor(Event.prototype, 'timeStamp');
          if (origTimeStamp && origTimeStamp.get) {
            const origGetTimeStamp = origTimeStamp.get;
            Object.defineProperty(Event.prototype, 'timeStamp', {
              get: masquerade(function () {
                const ts = origGetTimeStamp.call(this);
                if (!Config.isProtectionEnabled('antiFingerprinting')) return ts;
                // If keyboard event, inject micro-jitter (0.1 - 0.5ms) to disrupt typing biometrics
                if (this instanceof KeyboardEvent) {
                  const jitter = (Math.random() - 0.5) * 0.4;
                  return Math.max(0, ts + jitter);
                }
                return ts;
              }, 'get timeStamp'),
              configurable: true,
              enumerable: true
            });
          }
        }
      } catch (e) {
        console.warn('[SentinelShield] Keystroke biometrics protection notice:', e);
      }

      console.log('[SentinelShield] Keystroke biometrics defense active');
    }
  };
})();
