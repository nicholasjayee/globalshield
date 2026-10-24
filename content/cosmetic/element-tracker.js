// content/cosmetic/element-tracker.js
// Dedicated tracking and categorization logic for cosmetic DOM ad element removals.

(() => {
  'use strict';

  window.__SS_CONTENT = window.__SS_CONTENT || {};
  const { StatsReporter } = window.__SS_CONTENT;

  // WeakSet to prevent double-counting nodes removed in parent sweeps
  const trackedElements = new WeakSet();

  let sessionCount = 0;
  const elementTypes = {
    banner: 0,
    iframe: 0,
    container: 0,
    interstitial: 0,
    overlay: 0
  };

  const classifyElement = (el) => {
    if (!el || el.nodeType !== 1) return 'container';
    const tag = el.tagName;
    if (tag === 'IFRAME') return 'iframe';
    if (tag === 'INS') return 'banner';

    const cls = String(el.className || '');
    const id = String(el.id || '');
    if (/banner/i.test(cls) || /banner/i.test(id)) return 'banner';
    if (/popup|interstitial|modal/i.test(cls) || /popup|interstitial|modal/i.test(id)) return 'interstitial';
    if (/overlay|mask/i.test(cls) || /overlay|mask/i.test(id)) return 'overlay';

    return 'container';
  };

  window.__SS_CONTENT.ElementTracker = {
    recordRemoval(el, reason = 'generic-selector') {
      if (!el || el.nodeType !== 1) return false;
      if (trackedElements.has(el)) return false;

      trackedElements.add(el);
      sessionCount++;

      const category = classifyElement(el);
      elementTypes[category] = (elementTypes[category] || 0) + 1;

      // Report specifically as ad_elements
      if (window.__SS_CONTENT.StatsReporter) {
        window.__SS_CONTENT.StatsReporter.bump('ad_elements');
      }

      return true;
    },

    recordBatch(elements, reason = 'batch-removal') {
      if (!elements || typeof elements.forEach !== 'function') return 0;
      let count = 0;
      elements.forEach(el => {
        if (this.recordRemoval(el, reason)) {
          count++;
        }
      });
      return count;
    },

    getSessionStats() {
      return {
        total: sessionCount,
        breakdown: { ...elementTypes }
      };
    }
  };
})();
