// content/overlays/overlay-detector.js
// Heuristic detector for click-hijack layers, transparent overlays, and invisible traps.

(() => {
  'use strict';

  window.__SS_CONTENT = window.__SS_CONTENT || {};

  const YOUTUBE_SEARCH_ALLOWLIST = [
    'ytd-searchbox',
    'ytd-searchbox-renderer',
    '[role="search"]',
    '[aria-label*="Search" i]',
    '[aria-label="Search" i]',
    'input[placeholder*="Search" i]',
    'input[aria-label*="Search" i]',
    '#search-input'
  ].join(', ');

  window.__SS_CONTENT.OverlayDetector = {
    isAllowedElement(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.matches && el.matches(YOUTUBE_SEARCH_ALLOWLIST)) return true;
      if (el.closest) return !!el.closest(YOUTUBE_SEARCH_ALLOWLIST);
      return false;
    },
    isSuspiciousOverlay(el) {
      if (!el || el.nodeType !== 1) return false;
      if (this.isAllowedElement(el)) return false;
      if (!el.style && typeof getComputedStyle !== 'function') return false;

      const s = el.style || {};
      const computed = (typeof getComputedStyle === 'function') ? getComputedStyle(el) : {};

      const pos = s.position || computed.position;
      if (pos !== 'fixed') return false;

      const z = parseInt(s.zIndex || computed.zIndex, 10) || 0;
      if (z < 100000) return false;

      // Viewport coverage check
      const w = s.width || computed.width || '';
      const h = s.height || computed.height || '';
      const coversViewport =
        (w === '100vw' || w === '100%' || w === '') &&
        (h === '100vh' || h === '100%' || h === '');

      const top = s.top || computed.top || '';
      const hasTop = top === '0px' || top === '0' || top === '';

      if (!coversViewport && !hasTop) return false;

      const bg = s.background || s.backgroundColor || computed.backgroundColor || '';
      const transparentBg =
        bg === 'none' ||
        bg === 'transparent' ||
        bg === '' ||
        bg.startsWith('rgba(0, 0, 0, 0)') ||
        bg.startsWith('rgba(255, 255, 255, 0)');

      const opacity = parseFloat(s.opacity || computed.opacity || '1');
      const nearInvisible = opacity > 0 && opacity < 0.05;

      // Pattern 1: Transparent full-screen overlay
      if (transparentBg && coversViewport) {
        return true;
      }

      // Pattern 2: Near-invisible full-screen layer with external link
      if (nearInvisible) {
        const link = el.querySelector && el.querySelector('a[href]');
        if (link) {
          const href = link.getAttribute('href') || '';
          try {
            const u = new URL(href, location.href);
            if (u.origin !== location.origin) return true;
          } catch (_) {
            if (/^https?:/i.test(href)) return true;
          }
        }
      }

      return false;
    }
  };
})();
