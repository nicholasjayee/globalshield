// popup/popup.js
// Controller connecting popup UI to background service worker state.

'use strict';

import { popupRenderer, extractHostname } from './popup-renderer.js';

const elements = {
  totalCount: document.getElementById('total'),
  tabUrl: document.getElementById('tab-url'),
  tabCount: document.getElementById('tab-count'),
  modePill: document.getElementById('mode-pill'),
  dnsPill: document.getElementById('dns-pill'),
  refreshBtn: document.getElementById('refresh'),
  resetBtn: document.getElementById('reset'),
  deviceSettingsBtn: document.getElementById('open-device-settings'),
  networkWarning: document.getElementById('network-warning'),
  deviceWarning: document.getElementById('device-warning'),
  siteWarning: document.getElementById('site-warning'),
  siteControlsWarning: document.getElementById('site-controls-warning'),
  siteDeviceWarning: document.getElementById('site-device-warning'),
  siteCosmetic: document.getElementById('site-cosmetic'),
  settingToggles: [...document.querySelectorAll('[data-setting]')],
  siteDeviceToggles: [...document.querySelectorAll('[data-site-feature]')],
  categories: {
    ad_requests: document.getElementById('cat-ad-requests'),
    ad_elements: document.getElementById('cat-ad-elements'),
    trackers: document.getElementById('cat-trackers'),
    fingerprinters: document.getElementById('cat-fingerprinters'),
    privacy: document.getElementById('cat-privacy'),
    malicious: document.getElementById('cat-malicious'),
    hijack: document.getElementById('cat-hijack'),
    private_network: document.getElementById('cat-private-network'),
    popups: document.getElementById('cat-popups'),
    scripts: document.getElementById('cat-scripts'),
    overlays: document.getElementById('cat-overlays')
  }
};

let cachedDnsStatus = null;
let currentDomain = null;
let currentTabId = null;
let dnsValidationInProgress = false;
let isRefreshing = false;

const renderProtection = (state) => {
  if (!state || !state.status) return;
  for (const input of elements.settingToggles) {
    const setting = input.dataset.setting;
    const status = state.status[setting];
    if (!status) continue;
    const failed = Boolean(status.error);
    input.checked = status.enabled && !failed;
    input.disabled = failed;
    if (failed) {
      input.title = status.error;
    } else {
      input.removeAttribute('title');
    }
  }

  if (elements.siteCosmetic) {
    elements.siteCosmetic.checked = state.cosmeticEnabled;
    elements.siteCosmetic.disabled = !state.domain;
  }
  elements.siteControlsWarning.textContent = state.domain
    ? ''
    : 'Site controls are unavailable on Chrome pages. Open a website to change them.';
  elements.siteControlsWarning.hidden = Boolean(state.domain);

  let canAllowDeviceOnSite = false;
  for (const input of elements.siteDeviceToggles) {
    const feature = input.dataset.siteFeature;
    if (feature === 'pageGuards' || feature === 'antiFingerprinting') {
      input.checked = state.siteFeatures?.[feature] === true;
      input.disabled = !state.domain;
    } else {
      const status = state.status[`allowSite:${feature}`];
      const global = state.status[feature];
      input.checked = status?.enabled === true;
      input.disabled = !state.domain || global?.enabled !== true ||
        Boolean(global?.error || status?.error);
      if (global?.enabled === true) canAllowDeviceOnSite = true;
    }
  }
  elements.siteDeviceWarning.textContent = !state.domain
    ? 'Open a website to set site-specific access.'
    : canAllowDeviceOnSite
      ? ''
      : 'Turn on a global access block to allow it on this site.';
  elements.siteDeviceWarning.hidden = Boolean(state.domain && canAllowDeviceOnSite);

  const networkFiltering = state.status.networkFiltering?.enabled === true;
  elements.networkWarning.hidden = networkFiltering;
  const siteModeDiffers = state.domain && (
    state.cosmeticEnabled !== state.status.cosmeticFiltering?.enabled ||
    state.siteFeatures?.pageGuards !== state.status.pageGuards?.enabled ||
    state.siteFeatures?.antiFingerprinting !== state.status.antiFingerprinting?.enabled
  );
  elements.siteWarning.textContent = siteModeDiffers
    ? 'Site-specific protection overrides are active.'
    : '';
  elements.siteWarning.hidden = !siteModeDiffers;

  const errors = Object.entries(state.status)
    .filter(([, status]) => status.error)
    .map(([key]) => key);
  if (state.error) errors.unshift(`Settings storage: ${state.error}`);
  const unapplied = Object.entries(state.status)
    .filter(([, status]) => !status.applied && !status.error)
    .map(([key]) => key);
  if (errors.length) {
    elements.deviceWarning.textContent =
      `Chrome could not apply: ${errors.join(', ')}. Reload SentinelShield in chrome://extensions and check its Errors.`;
    elements.deviceWarning.classList.add('error');
    elements.deviceWarning.hidden = false;
  } else if (unapplied.length) {
    elements.deviceWarning.textContent = `Waiting for Chrome to confirm: ${unapplied.join(', ')}`;
    elements.deviceWarning.classList.remove('error');
    elements.deviceWarning.hidden = false;
  } else {
    elements.deviceWarning.classList.remove('error');
    elements.deviceWarning.hidden = true;
  }
};

const loadProtection = (tabId) => {
  if (typeof tabId !== 'number') return;
  chrome.runtime.sendMessage({ type: 'ss-get-protection', tabId }, (state) => {
    const error = chrome.runtime.lastError;
    if (error) {
      elements.deviceWarning.textContent = `Could not load protection settings: ${error.message}`;
      elements.deviceWarning.classList.add('error');
      elements.deviceWarning.hidden = false;
      return;
    }
    renderProtection(state);
  });
};

const saveProtection = (setting, enabled, feature = '') => {
  if (typeof currentTabId !== 'number') return;
  const input = setting === 'siteCosmetic'
    ? elements.siteCosmetic
    : (feature
      ? elements.siteDeviceToggles.find(item => item.dataset.siteFeature === feature)
      : elements.settingToggles.find(item => item.dataset.setting === setting));
  if (input) input.disabled = true;

  chrome.runtime.sendMessage({
    type: 'ss-set-protection',
    tabId: currentTabId,
    setting,
    feature,
    enabled
  }, (response) => {
    const error = chrome.runtime.lastError;
    if (error || !response?.ok) {
      elements.deviceWarning.textContent = `Could not update protection: ${error?.message || response?.error || 'Unknown error'}`;
      elements.deviceWarning.classList.add('error');
      elements.deviceWarning.hidden = false;
      loadProtection(currentTabId);
      return;
    }
    renderProtection(response.state);
    if (setting === 'siteCosmetic' && response.cosmeticApplied === false) {
      elements.deviceWarning.textContent = 'Site cleanup preference saved, but the page did not accept the live update. Reload the site to apply it.';
      elements.deviceWarning.classList.add('error');
      elements.deviceWarning.hidden = false;
    }
  });
};

// Request DNS validation once per domain or when status is missing
const requestDnsValidation = (tabId, domain, activeUrl) => {
  if (dnsValidationInProgress) return;
  if (!domain || domain === 'Internal Page' || !activeUrl.startsWith('http')) {
    cachedDnsStatus = { domain, status: 'local', consensus: true, dnssec: false };
    return;
  }

  dnsValidationInProgress = true;
  chrome.runtime.sendMessage(
    { type: 'ss-get-dns-status', tabId, domain, url: activeUrl },
    (dnsRes) => {
      dnsValidationInProgress = false;
      void chrome.runtime.lastError;
      if (dnsRes && typeof dnsRes === 'object') {
        cachedDnsStatus = dnsRes;
        // Re-render immediately once DNS verdict is received
        refresh();
      }
    }
  );
};

const refresh = async () => {
  if (isRefreshing) return;
  isRefreshing = true;

  try {
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (t) => {
        void chrome.runtime.lastError;
        resolve(t || []);
      });
    });

    const activeTab = tabs && tabs[0] ? tabs[0] : null;
    const tabId = activeTab ? activeTab.id : null;
    const activeUrl = (activeTab && activeTab.url) || '';
    const activeDomain = extractHostname(activeUrl);

    // If active tab or domain changed, reset cached DNS status
    if (activeDomain !== currentDomain) {
      currentDomain = activeDomain;
      currentTabId = tabId;
      cachedDnsStatus = null;
      dnsValidationInProgress = false;
      loadProtection(tabId);
    }
    currentTabId = tabId;

    // Trigger DNS validation if not yet cached or in flight
    if (!cachedDnsStatus && !dnsValidationInProgress && activeDomain) {
      requestDnsValidation(tabId, activeDomain, activeUrl);
    }

    // Fetch live tab & aggregate statistics (in-memory, immediate)
    const statsRes = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'ss-get-stats', tabId }, (res) => {
        void chrome.runtime.lastError;
        resolve(res || null);
      });
    });

    popupRenderer.render(elements, {
      totals: statsRes ? statsRes.totals : null,
      tabStats: statsRes ? statsRes.tabStats : null,
      dnsStatus: cachedDnsStatus,
      currentUrl: activeUrl
    });
  } catch (err) {
    console.warn('[SentinelShield] Error during refresh:', err);
  } finally {
    isRefreshing = false;
  }
};

const reset = async () => {
  chrome.runtime.sendMessage({ type: 'ss-reset' }, () => {
    void chrome.runtime.lastError;
    cachedDnsStatus = null;
    refresh();
  });
};

// ── Bind events ──
elements.refreshBtn.addEventListener('click', () => {
  cachedDnsStatus = null;
  dnsValidationInProgress = false;
  refresh();
});
elements.resetBtn.addEventListener('click', reset);
elements.deviceSettingsBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://settings/content/bluetooth' }, () => {
    const error = chrome.runtime.lastError;
    if (error) {
      elements.deviceWarning.textContent = `Could not open Chrome device settings: ${error.message}`;
      elements.deviceWarning.classList.add('error');
      elements.deviceWarning.hidden = false;
    }
  });
});
for (const input of elements.settingToggles) {
  input.addEventListener('change', () => saveProtection(input.dataset.setting, input.checked));
}
elements.siteCosmetic.addEventListener('change', () =>
  saveProtection('siteCosmetic', elements.siteCosmetic.checked)
);
for (const input of elements.siteDeviceToggles) {
  input.addEventListener('change', () =>
    saveProtection(
      ['pageGuards', 'antiFingerprinting'].includes(input.dataset.siteFeature)
        ? 'siteFeature'
        : 'siteDeviceAllow',
      input.checked,
      input.dataset.siteFeature
    )
  );
}

// ── Initial load and live poll ──
refresh();
const interval = setInterval(refresh, 2000);
window.addEventListener('unload', () => clearInterval(interval));

console.log('[SentinelShield] Popup controller active');
