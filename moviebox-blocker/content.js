// content.js  —  runs in ISOLATED world at document_start
(() => {
  'use strict';

  // ── Stats (persisted to chrome.storage) ────────────────────────
  const stats = { overlays: 0, popups: 0, scripts: 0, ads: 0 };

  const bump = (key) => {
    stats[key]++;
    chrome.storage.local.set({ mb_stats: stats });
    chrome.runtime.sendMessage({ type: 'mb-stat', stats }).catch(() => {});
  };

  chrome.storage.local.get('mb_stats', (r) => {
    if (r.mb_stats) Object.assign(stats, r.mb_stats);
  });

  // Listen for events fired by the MAIN-world script
  window.addEventListener('mb-blocked-popup', () => bump('popups'));
  window.addEventListener('mb-blocked-script', () => bump('scripts'));

  // ── Specific MovieBox Ad Selectors ─────────────────────────────
  const MB_ADS = [
    // Legacy / movieboxhd.net
    '.popup-mask',
    '.pc-ads',
    '.pc-ads-content',
    '.pc-detail-banner',
    '.h5-detail-banner',
    '.detail-ad-row',
    '.third-party-script-ad',
    '.pc-ad-sdk',
    '.h5-ad-sdk',
    '.H5HomePageBannerPC',
    '.pc-H5DetailBannerPC-sdkAds',
    // mzfi.me / ArtPlayer PC page
    '.pc-video-Ads',
    '.third-party-ad',
    '.pc-detail-ads',
    // mzfi.me / ArtPlayer H5 (mobile) page
    '.mobile-ad-below-player',
    '.ad-wrapper',
    '.h5-third-party-ads',
    '#downloadNative',
    '.download-native',
    // comment these out after investigation these are premium cards
    '.mp-mask',
    '.h5-trial-expired',
    '.pc-trial-expired',
    '.art-layer-trialCountdown',
  ];

  // ── Region-lock / app-nudge cover (mzfi.me video page) ─────────
  // When the site decides to swap the player for a "not available in
  // your region" overlay, it mounts .pc-cover-img / .pc-playerr.
  const REGION_LOCK_SELECTORS = [
    '.video-cover.pc-cover-img',
    '.pc-playerr'
  ];

  // ── Overlay detection ──────────────────────────────────────────
  function isHijackOverlay(el) {
    if (el.nodeType !== 1) return false;
    if (el.tagName !== 'DIV' && el.tagName !== 'A' && el.tagName !== 'IFRAME')
      return false;
    const s = el.style;
    if (!s) return false;

    const pos = s.position || getComputedStyle(el).position;
    const z = parseInt(s.zIndex || getComputedStyle(el).zIndex, 10);
    const bg = s.background || s.backgroundColor || '';
    const transparent =
      bg === 'none' || bg === 'transparent' ||
      bg === '' || bg.startsWith('rgba(0, 0, 0, 0)');

    const coversViewport =
      (s.width === '100vw' || s.width === '100%') &&
      (s.height === '100vh' || s.height === '100%');

    return pos === 'fixed' && z > 100000 && transparent && coversViewport;
  }

  function sweep(root) {
    const scope = root || document;

    // 1. Check root itself for generic hijack overlay
    if (isHijackOverlay(scope)) {
      scope.remove();
      bump('overlays');
      return;
    }

    // 1b. Check root itself against ad selectors.
    //     Vue renders each ad container as a single tree addition, so
    //     the added node IS the ad container. Without this check we'd
    //     only catch it via the 500ms watchdog interval.
    if (scope.matches) {
      for (const selector of MB_ADS) {
        if (scope.matches(selector)) {
          scope.remove();
          bump('ads');
          return;
        }
      }
      // Only strip the region-lock cover if a live player is present.
      if (document.querySelector('.artplayer-app-pc')) {
        for (const selector of REGION_LOCK_SELECTORS) {
          if (scope.matches(selector)) {
            scope.remove();
            bump('overlays');
            return;
          }
        }
      }
    }

    // 2. Check descendants for generic hijack overlay
    scope.querySelectorAll('div, a, iframe').forEach((el) => {
      if (isHijackOverlay(el)) {
        el.remove();
        bump('overlays');
      }
    });

    // 3. Explicitly remove MovieBox specific ad containers
    MB_ADS.forEach(selector => {
      scope.querySelectorAll(selector).forEach(el => {
        el.remove();
        bump('ads');
      });
    });

    // 4. Remove the region-lock cover if the player is present.
    const hasPlayer = document.querySelector('.artplayer-app-pc');
    if (hasPlayer) {
      REGION_LOCK_SELECTORS.forEach(selector => {
        scope.querySelectorAll(selector).forEach(el => {
          el.remove();
          bump('overlays');
        });
      });
    }
  }

  // ── MutationObserver: kill on (re-)injection ───────────────────
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) sweep(node);
      }
    }
  });

  // ── Player watchdog ────────────────────────────────────────────
  let ticks = 0;
  const interval = setInterval(() => {
    sweep();
    if (++ticks > 120) clearInterval(interval); // 60s @ 500ms
  }, 500);

  // ── Boot ───────────────────────────────────────────────────────
  const boot = () => {
    sweep();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  };

  if (document.readyState === 'loading') {
    // Run an immediate sweep now, then again on DOMContentLoaded.
    // Catches SSR'd ad nodes before the SPA hydrates.
    sweep();
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // ── SPA route changes: re-sweep ────────────────────────────────
  const wrapHistory = (fn) => function (...args) {
    const r = fn.apply(this, args);
    setTimeout(sweep, 0);
    return r;
  };
  history.pushState = wrapHistory(history.pushState);
  history.replaceState = wrapHistory(history.replaceState);
  window.addEventListener('popstate', () => setTimeout(sweep, 0));

  console.log('[MB-blocker] content guard active');
})();