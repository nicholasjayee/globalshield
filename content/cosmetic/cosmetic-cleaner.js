// content/cosmetic/cosmetic-cleaner.js
// Core cosmetic filtering engine coordinating generic and site-specific DOM sanitization,
// reporting distinct ad_elements metrics via ElementTracker.

(() => {
  'use strict';

  window.__SS_CONTENT = window.__SS_CONTENT || {};
  const {
    GENERIC_AD_SELECTORS,
    IframeFilter,
    MovieboxRules,
    OverlayDetector,
    StatsReporter,
    ElementTracker
  } = window.__SS_CONTENT;

  const removeAdElement = (el, reason = 'generic-ad') => {
    if (!el || el.nodeType !== 1) return;
    if (window.__SS_CONTENT.ElementTracker) {
      window.__SS_CONTENT.ElementTracker.recordRemoval(el, reason);
    } else if (StatsReporter) {
      StatsReporter.bump('ad_elements');
    }
    try {
      el.remove();
    } catch (_) {}
  };

  const removeOverlayElement = (el) => {
    if (!el || el.nodeType !== 1) return;
    try {
      el.remove();
    } catch (_) {}
    if (StatsReporter) {
      StatsReporter.bump('overlays');
    }
  };

  window.__SS_CONTENT.CosmeticCleaner = {
    sweep(root = document) {
      const scope = (root && root.nodeType === 1) ? root : document;
      const isMoviebox = MovieboxRules && MovieboxRules.isTargetSite();

      // ── 1. Check root node itself ──
      if (scope.matches) {
        // (a) Generic ad selectors
        for (const selector of GENERIC_AD_SELECTORS) {
          try {
            if (scope.matches(selector)) {
              removeAdElement(scope, 'root-ad-selector');
              return;
            }
          } catch (_) {}
        }

        // (b) Iframe filter on self
        if (scope.tagName === 'IFRAME' && IframeFilter.isBlockedIframe(scope)) {
          removeAdElement(scope, 'root-ad-iframe');
          return;
        }

        // (c) Overlay check on self
        if (OverlayDetector.isSuspiciousOverlay(scope)) {
          removeOverlayElement(scope);
          return;
        }
      }

      // ── 2. MovieBox specific cleaning ──
      if (isMoviebox) {
        MovieboxRules.clean(
          scope,
          () => {
            if (window.__SS_CONTENT.ElementTracker) {
              window.__SS_CONTENT.ElementTracker.recordRemoval(scope, 'moviebox-ad');
            } else if (StatsReporter) {
              StatsReporter.bump('ad_elements');
            }
          },
          () => removeOverlayElement(scope)
        );
      }

      // ── 3. Query and remove descendant ad containers ──
      for (const selector of GENERIC_AD_SELECTORS) {
        try {
          scope.querySelectorAll(selector).forEach(el => {
            removeAdElement(el, 'descendant-ad-selector');
          });
        } catch (_) {}
      }

      // ── 4. Query and inspect descendant iframes ──
      scope.querySelectorAll('iframe').forEach(iframe => {
        if (IframeFilter.isBlockedIframe(iframe)) {
          removeAdElement(iframe, 'ad-network-iframe');
        }
      });

      // ── 5. Query and remove full-screen hijack overlays ──
      scope.querySelectorAll('div, a, iframe').forEach(el => {
        if (OverlayDetector.isAllowedElement && OverlayDetector.isAllowedElement(el)) {
          return;
        }
        if (OverlayDetector.isSuspiciousOverlay(el)) {
          removeOverlayElement(el);
        }
      });
    }
  };
})();
