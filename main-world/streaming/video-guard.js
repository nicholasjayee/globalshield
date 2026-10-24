// Suppresses the MovieBox trial-state timeupdate listener on streaming targets.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;
  const SUPPRESSED_VIDEO_EVENTS = ['timeupdate'];

  window.__SS_MAIN.VideoGuard = {
    init() {
      if (!Config.isStreamingTarget()) return;

      const suppressed = new Set(SUPPRESSED_VIDEO_EVENTS);
      const nativeAddEventListener = EventTarget.prototype.addEventListener;

      EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (
          Config.isProtectionEnabled('pageGuards') &&
          this instanceof HTMLVideoElement &&
          typeof type === 'string' &&
          suppressed.has(type)
        ) {
          console.warn('[SentinelShield] Suppressed streaming video listener:', type);
          EventBridge.reportScriptBlocked(`video-listener-${type}`);
          return;
        }
        return nativeAddEventListener.call(this, type, listener, options);
      };

      console.log('[SentinelShield] Streaming video guard active on target domain');
    }
  };
})();
