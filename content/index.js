// content/index.js
// Isolated World Content Script Bootstrap.

(() => {
  'use strict';

  const content = window.__SS_CONTENT;
  if (!content) return;

  const { StatsReporter, Observer } = content;

  if (StatsReporter) StatsReporter.init();
  if (Observer) Observer.init();

  console.log('[SentinelShield] Content script protection active');
})();
