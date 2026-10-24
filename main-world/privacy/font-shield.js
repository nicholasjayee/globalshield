// main-world/privacy/font-shield.js
// Dedicated defense against system font enumeration and font-package profiling.
// Restricts font detection probes to standard universal cross-platform web fonts,
// preventing unique Linux OS font packages (e.g. STIX, Liberation, Noto packs)
// from creating a high-entropy device fingerprint.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;

  const masquerade = (fn, originalName = '') => {
    try {
      const name = originalName || fn.name || '';
      Object.defineProperty(fn, 'name', { value: name, configurable: true });
      fn.toString = () => `function ${name}() { [native code] }`;
    } catch (_) {}
    return fn;
  };

  // Standard universal cross-platform web-safe fonts
  const STANDARD_FONTS = new Set([
    'arial',
    'helvetica',
    'times new roman',
    'times',
    'courier new',
    'courier',
    'verdana',
    'georgia',
    'trebuchet ms',
    'impact',
    'comic sans ms',
    'segoe ui',
    'roboto',
    'open sans',
    'lato',
    'sans-serif',
    'serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui'
  ]);

  const extractFontFamily = (fontString) => {
    if (!fontString || typeof fontString !== 'string') return '';
    // Strip size, style, weight (e.g. "12px 'Liberation Mono'") -> "liberation mono"
    const cleaned = fontString
      .replace(/\b\d+(\.\d+)?(px|pt|em|rem|%)\b/gi, '')
      .replace(/["']/g, '')
      .replace(/\b(italic|bold|normal|small-caps|bolder|lighter)\b/gi, '')
      .toLowerCase()
      .trim();
    return cleaned;
  };

  window.__SS_MAIN.FontShield = {
    init() {
      // ═════════════════════════════════════════════════════════════════════
      // 1. DOCUMENT.FONTS.CHECK DEFENSE
      // ═════════════════════════════════════════════════════════════════════
      try {
        if (document.fonts && document.fonts.check) {
          const origCheck = document.fonts.check.bind(document.fonts);
          document.fonts.check = masquerade(function (font, text) {
            if (!Config.isProtectionEnabled('antiFingerprinting')) {
              return origCheck(font, text);
            }
            const family = extractFontFamily(font);
            // If checking a generic or universally safe font, allow native response
            if (STANDARD_FONTS.has(family)) {
              return origCheck(font, text);
            }
            // For exotic or system-specific fonts (e.g. "STIX Two Math", "Jomolhari"),
            // return false to prevent OS font-pack fingerprinting
            if (EventBridge?.reportFingerprintBlocked) {
              EventBridge.reportFingerprintBlocked('font-probe');
            }
            return false;
          }, 'check');
        }
      } catch (e) {
        console.warn('[SentinelShield] Font shield protection notice:', e);
      }

      console.log('[SentinelShield] System font enumeration shield active');
    }
  };
})();
