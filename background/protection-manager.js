'use strict';

const STORAGE_KEY = 'ss_protection_settings';
const RULESET_IDS = {
  networkFiltering: 'rules_global',
  streamingFiltering: 'rules_streaming'
};
const CONTENT_SETTINGS = {
  blockCamera: { type: 'camera', blockedSetting: 'block' },
  blockMicrophone: { type: 'microphone', blockedSetting: 'block' },
  blockLocation: { type: 'location', blockedSetting: 'block' },
  blockNotifications: { type: 'notifications', blockedSetting: 'block' },
  blockClipboard: { type: 'clipboardReadWrite', blockedSetting: 'block' },
  sessionOnlyCookies: { type: 'cookies', blockedSetting: 'session_only' }
};
const createDefaultSettings = () => ({
  networkFiltering: true,
  streamingFiltering: true,
  cosmeticFiltering: true,
  pageGuards: true,
  antiFingerprinting: true,
  blockCamera: true,
  blockMicrophone: true,
  blockLocation: true,
  blockNotifications: true,
  blockClipboard: true,
  blockBluetoothApis: true,
  sessionOnlyCookies: false,
  siteCosmetic: Object.create(null),
  siteDeviceAllow: Object.create(null),
  siteFeatures: Object.create(null)
});

let settings = createDefaultSettings();
const failures = new Map();
const applied = new Map();

const callChrome = (method, args) => new Promise((resolve, reject) => {
  method(...args, (result) => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message));
    else resolve(result);
  });
});

const normalizeDomain = (domain) => {
  if (typeof domain !== 'string' || !domain.trim()) return '';
  try {
    return new URL(`https://${domain.trim()}`).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
};

const sitePattern = (domain) => `*://[*.]${domain}/*`;

const copyBooleanMap = (value) => {
  const result = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, enabled] of Object.entries(value)) {
    const domain = normalizeDomain(key);
    if (domain && typeof enabled === 'boolean') result[domain] = enabled;
  }
  return result;
};

const loadSettings = async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    settings = createDefaultSettings();
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    return;
  }

  settings = createDefaultSettings();
  for (const key of Object.keys(settings)) {
    if (typeof settings[key] === 'boolean' && typeof value[key] === 'boolean') {
      settings[key] = value[key];
    }
  }
  settings.siteCosmetic = copyBooleanMap(value.siteCosmetic);
  settings.siteDeviceAllow = Object.create(null);

  if (value.siteDeviceAllow && typeof value.siteDeviceAllow === 'object' &&
      !Array.isArray(value.siteDeviceAllow)) {
    for (const [key, rawAllowances] of Object.entries(value.siteDeviceAllow)) {
      const domain = normalizeDomain(key);
      if (!domain || !rawAllowances || typeof rawAllowances !== 'object') continue;
      const allowances = Object.create(null);
      for (const feature of [
        'blockCamera', 'blockMicrophone', 'blockLocation',
        'blockNotifications', 'blockClipboard'
      ]) {
        if (typeof rawAllowances[feature] === 'boolean') {
          allowances[feature] = rawAllowances[feature];
        }
      }
      settings.siteDeviceAllow[domain] = allowances;
    }
  }

  settings.siteFeatures = Object.create(null);
  if (value.siteFeatures && typeof value.siteFeatures === 'object' &&
      !Array.isArray(value.siteFeatures)) {
    for (const [key, rawFeatures] of Object.entries(value.siteFeatures)) {
      const domain = normalizeDomain(key);
      if (!domain || !rawFeatures || typeof rawFeatures !== 'object') continue;
      const features = Object.create(null);
      for (const feature of ['pageGuards', 'antiFingerprinting']) {
        if (typeof rawFeatures[feature] === 'boolean') features[feature] = rawFeatures[feature];
      }
      settings.siteFeatures[domain] = features;
    }
  }
};

const saveSettings = () => chrome.storage.local.set({ [STORAGE_KEY]: settings });

const setContentSetting = async (feature, enabled, domain = '') => {
  const config = CONTENT_SETTINGS[feature];
  const api = chrome.contentSettings && chrome.contentSettings[config.type];
  if (!api) throw new Error(`Chrome does not expose the ${config.type} content setting`);

  const setting = config.type === 'cookies'
    ? (enabled ? 'session_only' : 'allow')
    : (enabled ? config.blockedSetting : 'allow');

  if (domain && (feature === 'blockCamera' || feature === 'blockMicrophone' ||
      feature === 'blockLocation' || feature === 'blockNotifications' || feature === 'blockClipboard')) {
    const pattern = sitePattern(domain);
    if (enabled) {
      await callChrome(api.clear.bind(api), [{ primaryPattern: pattern, scope: 'regular' }]);
      return;
    }
    await callChrome(api.set.bind(api), [{
      primaryPattern: pattern,
      ...(config.type === 'location' ? { secondaryPattern: '<all_urls>' } : {}),
      setting: 'allow',
      scope: 'regular'
    }]);
    return;
  }

  if (!enabled && config.type !== 'cookies') {
    await callChrome(api.clear.bind(api), [{ scope: 'regular' }]);
    return;
  }
  if (!enabled && config.type === 'cookies') {
    await callChrome(api.clear.bind(api), [{ scope: 'regular' }]);
    return;
  }

  await callChrome(api.set.bind(api), [{
    primaryPattern: '<all_urls>',
    ...(config.type === 'cookies' ? { secondaryPattern: '<all_urls>' } : {}),
    setting,
    scope: 'regular'
  }]);
};

const clearSiteContentSetting = async (feature, domain) => {
  const api = chrome.contentSettings[CONTENT_SETTINGS[feature].type];
  await callChrome(api.clear.bind(api), [{
    primaryPattern: sitePattern(domain),
    scope: 'regular'
  }]);
};

const applyContentFeature = async (feature) => {
  const enabled = settings[feature] === true;
  await setContentSetting(feature, enabled);
  const exceptions = settings.siteDeviceAllow || {};
  if (feature !== 'sessionOnlyCookies') {
    for (const [domain, allowed] of Object.entries(exceptions)) {
      if (enabled && allowed && allowed[feature] === true) {
        await setContentSetting(feature, false, domain);
        applied.set(`allowSite:${feature}`, true);
      } else {
        await clearSiteContentSetting(feature, domain);
      }
    }
  }
  failures.delete(feature);
  applied.set(feature, true);
};

const applyRulesets = async () => {
  const enabledRuleSetIds = Object.entries(RULESET_IDS)
    .filter(([key]) => settings[key] === true)
    .map(([, id]) => id);
  const disabledRuleSetIds = Object.entries(RULESET_IDS)
    .filter(([key]) => settings[key] !== true)
    .map(([, id]) => id);
  await callChrome(chrome.declarativeNetRequest.updateEnabledRulesets.bind(chrome.declarativeNetRequest), [{
    enableRulesetIds: enabledRuleSetIds,
    disableRulesetIds: disabledRuleSetIds
  }]);
  failures.delete('networkFiltering');
  failures.delete('streamingFiltering');
  applied.set('networkFiltering', true);
  applied.set('streamingFiltering', true);
};

export const protectionManager = {
  async init() {
    try {
      await loadSettings();
    } catch (error) {
      console.error('[SentinelShield] Could not load protection settings; using secure defaults:', error);
      settings = createDefaultSettings();
      failures.set('settingsStorage', error.message);
    }
    try {
      await applyRulesets();
    } catch (error) {
      console.error('[SentinelShield] Could not apply network filter settings:', error);
      failures.set('networkFiltering', error.message);
      failures.set('streamingFiltering', error.message);
    }

    for (const feature of Object.keys(CONTENT_SETTINGS)) {
      try {
        await applyContentFeature(feature);
      } catch (error) {
        console.error(`[SentinelShield] Could not apply ${feature}:`, error);
        failures.set(feature, error.message);
      }
    }
  },

  getState(domain = '') {
    const cleanDomain = normalizeDomain(domain);
    const siteAllow = (settings.siteDeviceAllow[cleanDomain] || {});
    const status = {};
    for (const key of [
      ...Object.keys(RULESET_IDS),
      'cosmeticFiltering',
      'pageGuards',
      'antiFingerprinting',
      'blockBluetoothApis',
      ...Object.keys(CONTENT_SETTINGS)
    ]) {
      status[key] = {
        enabled: settings[key] === true,
        error: failures.get(key) || '',
        applied: key === 'cosmeticFiltering' || key === 'pageGuards' ||
          key === 'antiFingerprinting' || key === 'blockBluetoothApis' ||
          applied.get(key) === true
      };
    }
    for (const key of ['blockCamera', 'blockMicrophone', 'blockLocation', 'blockNotifications', 'blockClipboard']) {
      status[`allowSite:${key}`] = {
        enabled: siteAllow[key] === true,
        error: failures.get(`allowSite:${key}`) || '',
        applied: settings[key] !== true || siteAllow[key] !== true ||
          applied.get(`allowSite:${key}`) === true
      };
    }
    return {
      domain: cleanDomain,
      error: failures.get('settingsStorage') || '',
      status,
      cosmeticEnabled: cleanDomain && Object.hasOwn(settings.siteCosmetic, cleanDomain)
        ? settings.siteCosmetic[cleanDomain] === true
        : settings.cosmeticFiltering === true,
      siteFeatures: {
        pageGuards: cleanDomain && settings.siteFeatures[cleanDomain] &&
          typeof settings.siteFeatures[cleanDomain].pageGuards === 'boolean'
          ? settings.siteFeatures[cleanDomain].pageGuards
          : settings.pageGuards === true,
        antiFingerprinting: cleanDomain && settings.siteFeatures[cleanDomain] &&
          typeof settings.siteFeatures[cleanDomain].antiFingerprinting === 'boolean'
          ? settings.siteFeatures[cleanDomain].antiFingerprinting
          : settings.antiFingerprinting === true
      }
    };
  },

  async setGlobal(feature, enabled) {
    if (!Object.hasOwn(createDefaultSettings(), feature) ||
        ['siteCosmetic', 'siteDeviceAllow', 'siteFeatures'].includes(feature)) {
      throw new Error('Unknown protection setting');
    }
    if (typeof enabled !== 'boolean') throw new Error('Setting value must be boolean');

    const prior = settings[feature];
    settings[feature] = enabled;
    try {
      await saveSettings();
      if (Object.hasOwn(RULESET_IDS, feature)) await applyRulesets();
      else if (Object.hasOwn(CONTENT_SETTINGS, feature)) await applyContentFeature(feature);
      failures.delete(feature);
    } catch (error) {
      settings[feature] = prior;
      try {
        await saveSettings();
      } catch (storageError) {
        console.error('[SentinelShield] Could not roll back saved protection settings:', storageError);
      }
      try {
        if (Object.hasOwn(RULESET_IDS, feature)) await applyRulesets();
        else if (Object.hasOwn(CONTENT_SETTINGS, feature)) await applyContentFeature(feature);
      } catch (restoreError) {
        console.error(`[SentinelShield] Could not restore ${feature} after failure:`, restoreError);
      }
      failures.set(feature, error.message);
      throw error;
    }
  },

  async setSiteCosmetic(domain, enabled) {
    const cleanDomain = normalizeDomain(domain);
    if (!cleanDomain || typeof enabled !== 'boolean') throw new Error('Invalid site cosmetic setting');
    const previous = settings.siteCosmetic[cleanDomain];
    settings.siteCosmetic[cleanDomain] = enabled;
    try {
      await saveSettings();
    } catch (error) {
      if (previous === undefined) delete settings.siteCosmetic[cleanDomain];
      else settings.siteCosmetic[cleanDomain] = previous;
      throw error;
    }
    return this.getState(cleanDomain);
  },

  async setSiteFeature(domain, feature, enabled) {
    const cleanDomain = normalizeDomain(domain);
    if (!cleanDomain || !['pageGuards', 'antiFingerprinting'].includes(feature) ||
        typeof enabled !== 'boolean') {
      throw new Error('Invalid site protection setting');
    }

    const previous = settings.siteFeatures[cleanDomain];
    settings.siteFeatures[cleanDomain] = { ...(previous || {}), [feature]: enabled };
    try {
      await saveSettings();
    } catch (error) {
      if (previous === undefined) delete settings.siteFeatures[cleanDomain];
      else settings.siteFeatures[cleanDomain] = previous;
      throw error;
    }
    return this.getState(cleanDomain);
  },

  async setSiteDeviceAllow(domain, feature, allowed) {
    const cleanDomain = normalizeDomain(domain);
    const config = CONTENT_SETTINGS[feature];
    if (!cleanDomain || !config || feature === 'sessionOnlyCookies' || typeof allowed !== 'boolean') {
      throw new Error('Invalid site device permission setting');
    }

    const prior = settings.siteDeviceAllow[cleanDomain] || {};
    const next = { ...prior, [feature]: allowed };
    settings.siteDeviceAllow[cleanDomain] = next;
    try {
      await saveSettings();
      if (settings[feature] === true) {
        await setContentSetting(feature, !allowed, cleanDomain);
        applied.set(`allowSite:${feature}`, true);
      } else {
        await clearSiteContentSetting(feature, cleanDomain);
      }
      failures.delete(`allowSite:${feature}`);
    } catch (error) {
      settings.siteDeviceAllow[cleanDomain] = prior;
      try {
        await saveSettings();
      } catch (storageError) {
        console.error('[SentinelShield] Could not roll back saved site device settings:', storageError);
      }
      failures.set(`allowSite:${feature}`, error.message);
      throw error;
    }
    return this.getState(cleanDomain);
  }
};
