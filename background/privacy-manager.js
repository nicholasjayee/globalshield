// background/privacy-manager.js
// Configures browser-level privacy policies: WebRTC IP leak protection and hyperlink auditing.

'use strict';

export const privacyManager = {
  async init() {
    // ── 1. WebRTC IP Handling Policy (Prevent Local/Public IP Leakage) ──
    try {
      if (chrome.privacy && chrome.privacy.network && chrome.privacy.network.webRTCIPHandlingPolicy) {
        chrome.privacy.network.webRTCIPHandlingPolicy.get({}, (details) => {
          if (details && (details.levelOfControl === 'controllable_by_this_extension' || details.levelOfControl === 'controlled_by_this_extension')) {
            chrome.privacy.network.webRTCIPHandlingPolicy.set(
              { value: 'disable_non_proxied_udp' },
              () => {
                if (chrome.runtime.lastError) {
                  console.warn('[SentinelShield] WebRTC IP policy setting error:', chrome.runtime.lastError);
                } else {
                  console.log('[SentinelShield] WebRTC non-proxied UDP disabled');
                }
              }
            );
          } else {
            console.warn('[SentinelShield] WebRTC IP policy is controlled by another extension or policy');
          }
        });
      } else {
        console.warn('[SentinelShield] WebRTC IP policy API is unavailable');
      }
    } catch (e) {
      console.warn('[SentinelShield] Could not configure WebRTC IP policy:', e);
    }

    // ── 2. Disable Hyperlink Auditing (<a ping="..."> link tracking) ──
    try {
      if (chrome.privacy && chrome.privacy.websites && chrome.privacy.websites.hyperlinkAuditingEnabled) {
        chrome.privacy.websites.hyperlinkAuditingEnabled.get({}, (details) => {
          if (details && (details.levelOfControl === 'controllable_by_this_extension' || details.levelOfControl === 'controlled_by_this_extension')) {
            chrome.privacy.websites.hyperlinkAuditingEnabled.set(
              { value: false },
              () => {
                if (chrome.runtime.lastError) {
                  console.warn('[SentinelShield] Hyperlink auditing setting error:', chrome.runtime.lastError);
                } else {
                  console.log('[SentinelShield] Hyperlink auditing disabled (anti-ping tracking)');
                }
              }
            );
          } else {
            console.warn('[SentinelShield] Hyperlink auditing is controlled by another extension or policy');
          }
        });
      } else {
        console.warn('[SentinelShield] Hyperlink auditing setting API is unavailable');
      }
    } catch (e) {
      console.warn('[SentinelShield] Could not disable hyperlink auditing:', e);
    }
  }
};
