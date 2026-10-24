// main-world/index.js
// Main World bootstrap: orchestrates shields, guards, anti-adblock defusers, and DNS security.

(() => {
  'use strict';

  const main = window.__SS_MAIN;
  if (!main) return;

  const {
    PopupGuard,
    RedirectGuard,
    FetchGuard,
    XhrGuard,
    BeaconGuard,
    WebSocketGuard,
    ElementGuard,
    ClickGuard,
    ClipboardGuard,
    HistoryGuard,
    PermissionGuard,
    ServiceWorkerGuard,
    AntiAdblockDefuser,
    WebRTCShield,
    FingerprintShield,
    DOMRectShield,
    FontShield,
    KeystrokeGuard,
    VideoGuard,
    FallbackPlayer,
    EventBridge
  } = main;

  // 1. Initialize privacy & anti-tracking shields
  if (WebRTCShield) WebRTCShield.init();
  if (FingerprintShield) FingerprintShield.init();
  // The legacy timezone spoof is intentionally not initialized.
  if (DOMRectShield) DOMRectShield.init();
  if (FontShield) FontShield.init();

  // 2. Initialize anti-adblock inert stubs
  if (AntiAdblockDefuser) AntiAdblockDefuser.init();

  // 3. Initialize navigation, pop-up, service-worker & redirect guards
  if (PopupGuard) PopupGuard.init();
  if (RedirectGuard) RedirectGuard.init();
  if (HistoryGuard) HistoryGuard.init();
  if (PermissionGuard) PermissionGuard.init();
  if (ServiceWorkerGuard) ServiceWorkerGuard.init();

  // 4. Initialize network, WebSocket, DNS rebinding & telemetry guards
  if (FetchGuard) FetchGuard.init();
  if (XhrGuard) XhrGuard.init();
  if (WebSocketGuard) WebSocketGuard.init();
  if (BeaconGuard) BeaconGuard.init();

  // 5. Initialize DOM, clipboard, click & keystroke guards
  if (ElementGuard) ElementGuard.init();
  if (ClickGuard) ClickGuard.init();
  if (ClipboardGuard) ClipboardGuard.init();
  if (KeystrokeGuard) KeystrokeGuard.init();

  // 6. Initialize streaming / MovieBox specialized defenses
  if (VideoGuard) VideoGuard.init();
  if (FallbackPlayer) FallbackPlayer.init();

  // 7. Report initial site URL to background service worker via bridge
  if (EventBridge) EventBridge.reportSiteInit();

  // 8. Freeze namespace to prevent prototype tampering
  try {
    Object.freeze(window.__SS_MAIN);
  } catch (_) {}

  console.log('[SentinelShield] Full privacy, anti-fingerprinting, anti-hijack, and DNS defense suite online');
})();
