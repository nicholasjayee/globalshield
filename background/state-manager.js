// background/state-manager.js
// Manages global aggregate stats and per-tab session counters.

'use strict';

const STORAGE_KEY = 'ss_totals';

// Global counters (persisted in chrome.storage.local)
const totals = {
  ad_requests: 0,
  ad_elements: 0,
  ads: 0,
  trackers: 0,
  fingerprinters: 0,
  privacy: 0,
  malicious: 0,
  popups: 0,
  scripts: 0,
  overlays: 0,
  private_network: 0,
  hijack: 0
};

// In-memory per-tab counters. Keyed by tabId (integer).
// Resets when tab is closed or browser restarts.
const perTab = new Map();

// ── Debounced Persistence ──────────────────────────────────────────
let persistTimer = null;
const persistTotals = () => {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: totals });
    } catch (error) {
      console.warn('[SentinelShield] Could not persist statistics:', error);
    }
  }, 250);
};

// ── Per-tab Bucket Helper ──────────────────────────────────────────
const ensureTabBucket = (tabId) => {
  if (!perTab.has(tabId)) {
    perTab.set(tabId, {
      ad_requests: 0,
      ad_elements: 0,
      ads: 0,
      trackers: 0,
      fingerprinters: 0,
      privacy: 0,
      malicious: 0,
      popups: 0,
      scripts: 0,
      overlays: 0,
      private_network: 0,
      hijack: 0,
      url: ''
    });
  }
  return perTab.get(tabId);
};

const pageIdentity = (url) => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch (_) {
    return url;
  }
};

const resetTabCounts = (bucket) => {
  for (const key of Object.keys(totals)) {
    bucket[key] = 0;
  }
};

const setBucketUrl = (bucket, url) => {
  const nextUrl = url || '';
  if (bucket.url && pageIdentity(bucket.url) !== pageIdentity(nextUrl)) {
    resetTabCounts(bucket);
  }
  bucket.url = nextUrl;
};

export const stateManager = {
  // Hydrates persisted totals on service worker start
  async init() {
    try {
      const res = await chrome.storage.local.get(STORAGE_KEY);
      if (res && res[STORAGE_KEY] && typeof res[STORAGE_KEY] === 'object') {
        for (const key of Object.keys(totals)) {
          const value = res[STORAGE_KEY][key];
          if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
            totals[key] = value;
          }
        }
      }
    } catch (error) {
      console.warn('[SentinelShield] Could not load saved statistics:', error);
    }
  },

  increment(category, count = 1, tabId = null, tabUrl = null) {
    const cat = category === 'ads' ? 'ad_requests' : category;
    if (typeof cat !== 'string' || !Object.hasOwn(totals, cat)) return 0;
    const n = typeof count === 'number' && Number.isFinite(count) && count > 0
      ? Math.min(Math.floor(count), 10000)
      : 1;

    totals[cat] += n;
    persistTotals();

    if (typeof tabId === 'number' && tabId >= 0) {
      const bucket = ensureTabBucket(tabId);
      if (tabUrl && !bucket.url) setBucketUrl(bucket, tabUrl);
      bucket[cat] += n;
      return bucket;
    }
    return null;
  },

  setTabUrl(tabId, url) {
    if (typeof tabId !== 'number' || tabId < 0) return;
    const bucket = ensureTabBucket(tabId);
    setBucketUrl(bucket, url);
  },

  getStats(tabId = null) {
    const tabStats = (typeof tabId === 'number' && perTab.has(tabId))
      ? perTab.get(tabId)
      : null;
    return {
      totals: { ...totals },
      tabStats: tabStats ? { ...tabStats } : null
    };
  },

  getTabTotal(tabId) {
    if (typeof tabId !== 'number' || !perTab.has(tabId)) return 0;
    const b = perTab.get(tabId);
    return (b.ad_requests || 0) + (b.ad_elements || 0) + (b.ads || 0) +
           (b.trackers || 0) + (b.fingerprinters || 0) + (b.privacy || 0) +
           (b.malicious || 0) + (b.popups || 0) + (b.scripts || 0) +
           (b.overlays || 0) + (b.private_network || 0) + (b.hijack || 0);
  },

  removeTab(tabId) {
    perTab.delete(tabId);
  },

  async resetAll() {
    for (const key of Object.keys(totals)) {
      totals[key] = 0;
    }
    perTab.clear();
    await chrome.storage.local.set({ [STORAGE_KEY]: totals });
  }
};
