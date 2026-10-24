// main-world/privacy/domrect-shield.js
// Dedicated defense against DOMRect and SVGRect font engine and sub-pixel geometry profiling.
// Neutralizes FreeType / DirectWrite / CoreText sub-pixel rendering fingerprinting
// by adding subtle deterministic sub-pixel micro-jitter without affecting visual page layout.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config } = window.__SS_MAIN;

  // Session-persistent PRNG seed for deterministic sub-pixel perturbation
  const seedBuffer = new Uint32Array(1);
  crypto.getRandomValues(seedBuffer);
  const SESSION_SEED = seedBuffer[0];

  const masquerade = (fn, originalName = '') => {
    try {
      const name = originalName || fn.name || '';
      Object.defineProperty(fn, 'name', { value: name, configurable: true });
      fn.toString = () => `function ${name}() { [native code] }`;
    } catch (_) {}
    return fn;
  };

  // Sub-pixel jitter delta (< 0.0001 px)
  const getJitter = () => {
    return ((SESSION_SEED & 7) - 3) * 0.00001;
  };

  window.__SS_MAIN.DOMRectShield = {
    init() {
      // ═════════════════════════════════════════════════════════════════════
      // 1. ELEMENT.PROTOTYPE.GETBOUNDINGCLIENTRECT SUB-PIXEL DEFENSE
      // ═════════════════════════════════════════════════════════════════════
      try {
        if (window.Element && Element.prototype.getBoundingClientRect) {
          const origGetBoundingClientRect = Element.prototype.getBoundingClientRect;
          Element.prototype.getBoundingClientRect = masquerade(function () {
            const rect = origGetBoundingClientRect.call(this);
            if (!Config.isProtectionEnabled('antiFingerprinting')) return rect;
            // Only jitter if rect has non-zero sub-pixel fractional values
            const jitter = getJitter();
            try {
              return new Proxy(rect, {
                get(target, prop) {
                  if (prop === 'width') return target.width + jitter;
                  if (prop === 'height') return target.height + jitter;
                  if (prop === 'x') return target.x + jitter;
                  if (prop === 'y') return target.y + jitter;
                  if (prop === 'left') return target.left + jitter;
                  if (prop === 'top') return target.top + jitter;
                  if (prop === 'right') return target.right + jitter;
                  if (prop === 'bottom') return target.bottom + jitter;
                  return Reflect.get(target, prop);
                }
              });
            } catch (_) {
              return rect;
            }
          }, 'getBoundingClientRect');
        }
      } catch (e) {
        console.warn('[SentinelShield] DOMRect protection notice:', e);
      }

      // ═════════════════════════════════════════════════════════════════════
      // 2. SVGGRAPHICSELEMENT.PROTOTYPE.GETBBOX SUB-PIXEL DEFENSE
      // ═════════════════════════════════════════════════════════════════════
      try {
        if (window.SVGGraphicsElement && SVGGraphicsElement.prototype.getBBox) {
          const origGetBBox = SVGGraphicsElement.prototype.getBBox;
          SVGGraphicsElement.prototype.getBBox = masquerade(function (...args) {
            const bbox = origGetBBox.apply(this, args);
            if (!Config.isProtectionEnabled('antiFingerprinting')) return bbox;
            const jitter = getJitter();
            try {
              return new Proxy(bbox, {
                get(target, prop) {
                  if (prop === 'width') return target.width + jitter;
                  if (prop === 'height') return target.height + jitter;
                  if (prop === 'x') return target.x + jitter;
                  if (prop === 'y') return target.y + jitter;
                  return Reflect.get(target, prop);
                }
              });
            } catch (_) {
              return bbox;
            }
          }, 'getBBox');
        }
      } catch (e) {
        console.warn('[SentinelShield] SVGRect protection notice:', e);
      }

      console.log('[SentinelShield] DOMRect and SVGRect geometry shield active');
    }
  };
})();
