(() => {
  'use strict';

  const SETTING_KEY = 'ss_protection_settings';

  const publishDeviceSettings = (settings = {}) => {
    let domain = '';
    try {
      domain = new URL(location.href).hostname.toLowerCase();
    } catch (_) {}
    const siteFeatures = domain && settings.siteFeatures && settings.siteFeatures[domain]
      ? settings.siteFeatures[domain]
      : {};
    window.dispatchEvent(new CustomEvent('ss-device-protection-settings', {
      detail: {
        domain,
        blockBluetoothApis: settings.blockBluetoothApis !== false,
        pageGuardsEnabled: typeof siteFeatures.pageGuards === 'boolean'
          ? siteFeatures.pageGuards
          : settings.pageGuards !== false,
        antiFingerprintingEnabled: typeof siteFeatures.antiFingerprinting === 'boolean'
          ? siteFeatures.antiFingerprinting
          : settings.antiFingerprinting !== false
      }
    }));
  };

  chrome.storage.local.get(SETTING_KEY, (stored) => {
    if (chrome.runtime.lastError) {
      console.error('[SentinelShield] Could not load device protection settings:', chrome.runtime.lastError.message);
      publishDeviceSettings();
      return;
    }
    publishDeviceSettings(stored[SETTING_KEY]);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[SETTING_KEY]) return;
    publishDeviceSettings(changes[SETTING_KEY].newValue);
  });
})();
