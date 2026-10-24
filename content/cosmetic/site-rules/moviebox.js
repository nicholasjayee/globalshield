// content/cosmetic/site-rules/moviebox.js
// Dedicated cosmetic rules, ad containers, and region-lock cover handlers for MovieBox & mzfi.me.

(() => {
  'use strict';

  window.__SS_CONTENT = window.__SS_CONTENT || {};

  const MOVIEBOX_DOMAINS = [
    'movieboxhd.net',
    'mzfi.me',
    'aoneroom.com',
    'themoviebox.xyz'
  ];

  // Specific ad container selectors found across MovieBox web pages
  const MOVIEBOX_AD_SELECTORS = [
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
    // mzfi.me / ArtPlayer H5 mobile page
    '.mobile-ad-below-player',
    '.ad-wrapper',
    '.h5-third-party-ads',
    '#downloadNative',
    '.download-native',
    // Premium trial countdown & lockout cards
    '.mp-mask',
    '.h5-trial-expired',
    '.pc-trial-expired',
    '.art-layer-trialCountdown'
  ];

  // Region-lock / app-nudge cover elements that block the player
  const REGION_LOCK_SELECTORS = [
    '.video-cover.pc-cover-img',
    '.pc-playerr'
  ];

  window.__SS_CONTENT.MovieboxRules = {
    isTargetSite() {
      const host = location.hostname;
      return MOVIEBOX_DOMAINS.some(d => host === d || host.endsWith('.' + d));
    },

    matchesAd(el) {
      if (!el || !el.matches) return false;
      return MOVIEBOX_AD_SELECTORS.some(selector => {
        try { return el.matches(selector); } catch (_) { return false; }
      });
    },

    matchesRegionLock(el) {
      if (!el || !el.matches) return false;
      return REGION_LOCK_SELECTORS.some(selector => {
        try { return el.matches(selector); } catch (_) { return false; }
      });
    },

    clean(scope, onRemoveAd, onRemoveOverlay) {
      const root = (scope && scope.nodeType === 1) ? scope : document;

      // 1. Check root element if it matches an ad selector directly (Vue SPA hydration)
      if (root.matches) {
        if (this.matchesAd(root)) {
          root.remove();
          if (onRemoveAd) onRemoveAd();
          return;
        }

        // Only remove region-lock cover if a live video player is present
        const hasPlayer = !!document.querySelector('.artplayer-app-pc, video');
        if (hasPlayer && this.matchesRegionLock(root)) {
          root.remove();
          if (onRemoveOverlay) onRemoveOverlay();
          return;
        }
      }

      // 2. Query and remove descendant ad containers
      for (const selector of MOVIEBOX_AD_SELECTORS) {
        try {
          root.querySelectorAll(selector).forEach(el => {
            el.remove();
            if (onRemoveAd) onRemoveAd();
          });
        } catch (_) {}
      }

      // Remove region-lock cover descendants if player exists
      const hasPlayer = !!document.querySelector('.artplayer-app-pc, video');
      if (hasPlayer) {
        for (const selector of REGION_LOCK_SELECTORS) {
          try {
            root.querySelectorAll(selector).forEach(el => {
              el.remove();
              if (onRemoveOverlay) onRemoveOverlay();
            });
          } catch (_) {}
        }
      }
    }
  };
})();
