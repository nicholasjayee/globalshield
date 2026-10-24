(() => {
  'use strict';

  const BLOCKED_ERROR = () => new DOMException(
    'Blocked by SentinelShield device access control',
    'NotAllowedError'
  );
  let blockBluetoothApis = true;

  const wrapDeviceApi = (owner, methodName, behavior) => {
    if (!owner || typeof owner[methodName] !== 'function') return;
    const original = owner[methodName];
    try {
      owner[methodName] = function (...args) {
        if (blockBluetoothApis) {
          console.warn(`[SentinelShield] Blocked ${methodName} device access request`);
          return behavior();
        }
        return original.apply(this, args);
      };
      if (owner[methodName] !== original) return;
      console.warn(`[SentinelShield] Could not install ${methodName} device access guard`);
    } catch (error) {
      console.warn(`[SentinelShield] Could not install ${methodName} device access guard:`, error);
    }
  };

  const applyDeviceProtection = (settings) => {
    if (!settings || typeof settings !== 'object') return;
    blockBluetoothApis = settings.blockBluetoothApis !== false;
  };

  window.addEventListener('ss-device-protection-settings', (event) => {
    applyDeviceProtection(event.detail);
  });

  wrapDeviceApi(navigator.bluetooth, 'requestDevice', () => Promise.reject(BLOCKED_ERROR()));
  wrapDeviceApi(navigator.bluetooth, 'requestLEScan', () => Promise.reject(BLOCKED_ERROR()));
  wrapDeviceApi(navigator.bluetooth, 'getDevices', () => Promise.resolve([]));
  wrapDeviceApi(navigator.usb, 'requestDevice', () => Promise.reject(BLOCKED_ERROR()));
  wrapDeviceApi(navigator.usb, 'getDevices', () => Promise.resolve([]));
  wrapDeviceApi(navigator.hid, 'requestDevice', () => Promise.reject(BLOCKED_ERROR()));
  wrapDeviceApi(navigator.hid, 'getDevices', () => Promise.resolve([]));
  wrapDeviceApi(navigator.serial, 'requestPort', () => Promise.reject(BLOCKED_ERROR()));
  wrapDeviceApi(navigator.serial, 'getPorts', () => Promise.resolve([]));
})();
