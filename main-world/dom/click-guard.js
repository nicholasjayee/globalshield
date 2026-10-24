// main-world/dom/click-guard.js
// Traps capture-phase clicks on deceptive overlays, transparent hijack layers, and ad containers.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { EventBridge } = window.__SS_MAIN;

  const MOVIEBOX_AD_CLASSES = [
    'popup-mask',
    'pc-ads',
    'pc-ads-content',
    'pc-video-Ads',
    'third-party-ad',
    'third-party-ad__iframe',
    'pc-custome-ads-mid',
    'mp-mask',
    'art-layer-trialCountdown'
  ];

  const YOUTUBE_SEARCH_ALLOWLIST = [
    'ytd-searchbox',
    'ytd-searchbox-renderer',
    '[role="search"]',
    '[aria-label*="Search" i]',
    'input[placeholder*="Search" i]',
    'input[aria-label*="Search" i]',
    '#search-input'
  ].join(', ');

  const isAllowedYouTubeSearchElement = (el) => {
    if (!el || el.nodeType !== 1) return false;
    if (el.matches && el.matches(YOUTUBE_SEARCH_ALLOWLIST)) return true;
    if (el.closest) return !!el.closest(YOUTUBE_SEARCH_ALLOWLIST);
    return false;
  };

  const looksLikeHijackLayer = (el) => {
    if (!el || el.nodeType !== 1 || !el.style) return false;
    if (isAllowedYouTubeSearchElement(el)) return false;
    const s = el.style;

    const pos = s.position || (typeof getComputedStyle === 'function' && getComputedStyle(el).position);
    if (pos !== 'fixed') return false;

    const z = parseInt(s.zIndex || (typeof getComputedStyle === 'function' && getComputedStyle(el).zIndex), 10) || 0;
    if (z < 100000) return false;

    // Viewport coverage
    const coversViewport =
      (s.width === '100%' || s.width === '100vw' || s.width === '') &&
      (s.height === '100%' || s.height === '100vh' || s.height === '');
    const hasInset = (s.inset && s.inset.includes('0')) || s.top === '0px' || s.top === '0';
    if (!coversViewport && !hasInset) return false;

    // 1. Transparent overlay pattern
    const bg = s.background || s.backgroundColor || '';
    const transparentBg =
      bg === 'none' || bg === 'transparent' || bg === '' ||
      bg.startsWith('rgba(0, 0, 0, 0)');

    if (transparentBg) return true;

    // 2. Near-invisible click layer pattern (e.g. Adsterra --rdata)
    const opacity = parseFloat(s.opacity || '1');
    const nearInvisible = opacity > 0 && opacity < 0.05;

    if (nearInvisible) {
      const link = el.querySelector && el.querySelector('a[href]');
      if (!link) return false;
      const href = link.getAttribute('href') || '';
      try {
        const u = new URL(href, location.href);
        if (u.origin !== location.origin) return true;
      } catch (_) {
        if (/^https?:/i.test(href)) return true;
      }
    }

    return false;
  };

  const isMovieboxAdClick = (el) => {
    if (!el || el.nodeType !== 1) return false;
    if (el.classList) {
      for (const cls of MOVIEBOX_AD_CLASSES) {
        if (el.classList.contains(cls)) return true;
      }
    }
    if (el.closest) {
      const selector = MOVIEBOX_AD_CLASSES.map(c => '.' + c).join(', ');
      if (el.closest(selector)) return true;
    }
    return false;
  };

  window.__SS_MAIN.ClickGuard = {
    init() {
      window.addEventListener(
        'click',
        (e) => {
          if (!window.__SS_MAIN.Config.isProtectionEnabled('pageGuards')) return;
          let node = e.target;
          let hit = null;
          let isMbAd = false;

          // Walk up to 3 levels looking for hijack layer or ad container
          for (let i = 0; i < 3 && node; i++) {
            if (looksLikeHijackLayer(node)) {
              hit = node;
              break;
            }
            if (isMovieboxAdClick(node)) {
              hit = node;
              isMbAd = true;
              break;
            }
            node = node.parentElement;
          }

          if (hit) {
            e.stopImmediatePropagation();
            e.preventDefault();

            // Safely remove the overlay element
            try {
              hit.remove();
            } catch (_) {}

            console.warn('[SentinelShield] Hijack/ad click swallowed:', isMbAd ? 'moviebox-ad' : 'overlay');
            EventBridge.reportOverlayBlocked(isMbAd ? 'ad-container-click' : 'overlay-click');
          }
        },
        true // Capture phase
      );

      console.log('[SentinelShield] Click guard active');
    }
  };
})();
