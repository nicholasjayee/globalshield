// Prevents silent WebRTC IP address leaks and STUN candidate harvesting used by tracking networks.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { EventBridge } = window.__SS_MAIN;

  const CONFERENCING_DOMAINS = [
    'meet.google.com',
    'zoom.us',
    'teams.microsoft.com',
    'discord.com',
    'slack.com',
    'webex.com',
    'skype.com',
    'whereby.com'
  ];

  const isTrustedConferencingSite = () => {
    const host = location.hostname;
    return CONFERENCING_DOMAINS.some(d => host === d || host.endsWith('.' + d));
  };

  window.__SS_MAIN.WebRTCShield = {
    init() {
      if (isTrustedConferencingSite()) return;

      const RealRTCPeerConnection =
        window.RTCPeerConnection ||
        window.webkitRTCPeerConnection ||
        window.mozRTCPeerConnection;

      if (!RealRTCPeerConnection) return;

      const ProxiedRTCPeerConnection = function (configuration, ...rest) {
        if (!window.__SS_MAIN.Config.isProtectionEnabled('antiFingerprinting')) {
          return new RealRTCPeerConnection(configuration, ...rest);
        }
        let config = configuration;
        if (config && Array.isArray(config.iceServers)) {
          console.warn('[SentinelShield] WebRTC IP discovery probe neutralized');
          EventBridge.reportTrackersBlocked('webrtc-stun-probed');
          config = { ...config, iceServers: [] };
        }

        const pc = new RealRTCPeerConnection(config, ...rest);
        const sanitizeCandidate = (event) => {
          if (!window.__SS_MAIN.Config.isProtectionEnabled('antiFingerprinting')) return event;
          if (!event || !event.candidate) return event;
          const cand = event.candidate.candidate;
          if (cand && (cand.includes('typ host') || cand.includes('typ srflx'))) {
            EventBridge.reportTrackersBlocked('webrtc-candidate-leak-blocked');
            return null;
          }
          return event;
        };

        let userIceHandler = null;
        Object.defineProperty(pc, 'onicecandidate', {
          get() {
            return userIceHandler;
          },
          set(fn) {
            if (typeof fn === 'function') {
              userIceHandler = function (event) {
                const safeEvent = sanitizeCandidate(event);
                if (safeEvent) fn.call(this, safeEvent);
              };
            } else {
              userIceHandler = fn;
            }
          },
          configurable: true,
          enumerable: true
        });

        const origAddEvent = pc.addEventListener;
        pc.addEventListener = function (type, listener, options) {
          if (type === 'icecandidate' && typeof listener === 'function') {
            const wrapped = function (event) {
              const safeEvent = sanitizeCandidate(event);
              if (safeEvent) listener.call(this, safeEvent);
            };
            return origAddEvent.call(this, type, wrapped, options);
          }
          return origAddEvent.call(this, type, listener, options);
        };

        return pc;
      };

      ProxiedRTCPeerConnection.prototype = RealRTCPeerConnection.prototype;
      window.RTCPeerConnection = ProxiedRTCPeerConnection;
      if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = ProxiedRTCPeerConnection;

      console.log('[SentinelShield] WebRTC IP address shield active');
    }
  };
})();
