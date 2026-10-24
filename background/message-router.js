// background/message-router.js
// Dispatches runtime messages between content scripts, popup, and background services.

'use strict';

import { stateManager } from './state-manager.js';
import { badgeManager } from './badge-manager.js';
import { dnsSecurity } from './dns-security.js';
import { protectionManager } from './protection-manager.js';

export const messageRouter = {
  init() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || typeof msg !== 'object') return false;

      const isPopup = typeof sender.url === 'string' &&
        sender.url.startsWith(chrome.runtime.getURL('popup/'));

      if (msg.type === 'ss-get-protection') {
        if (!isPopup || typeof msg.tabId !== 'number') return false;
        chrome.tabs.get(msg.tabId, (tab) => {
          const error = chrome.runtime.lastError;
          if (error) {
            sendResponse({ error: error.message });
            return;
          }
          let domain = '';
          try {
            const url = new URL(tab.url || '');
            if (url.protocol === 'http:' || url.protocol === 'https:') domain = url.hostname;
          } catch (_) {}
          sendResponse(protectionManager.getState(domain));
        });
        return true;
      }

      if (msg.type === 'ss-set-protection') {
        if (!isPopup || typeof msg.tabId !== 'number' || typeof msg.enabled !== 'boolean') return false;
        chrome.tabs.get(msg.tabId, async (tab) => {
          const error = chrome.runtime.lastError;
          if (error) {
            sendResponse({ ok: false, error: error.message });
            return;
          }

          let domain = '';
          try {
            const url = new URL(tab.url || '');
            if (url.protocol === 'http:' || url.protocol === 'https:') domain = url.hostname;
          } catch (_) {}
          if (!domain && ['siteCosmetic', 'siteFeature', 'siteDeviceAllow'].includes(msg.setting)) {
            sendResponse({ ok: false, error: 'Protection controls are unavailable for this page.' });
            return;
          }

          try {
            if (msg.setting === 'siteCosmetic') {
              await protectionManager.setSiteCosmetic(domain, msg.enabled);
              chrome.tabs.sendMessage(msg.tabId, {
                type: 'ss-cosmetic-setting',
                enabled: msg.enabled
              }, { frameId: 0 }, () => {
                const deliveryError = chrome.runtime.lastError;
                sendResponse({
                  ok: true,
                  cosmeticApplied: !deliveryError,
                  state: protectionManager.getState(domain)
                });
              });
              return;
            }

            if (!domain) {
              await protectionManager.setGlobal(msg.setting, msg.enabled);
              sendResponse({ ok: true, state: protectionManager.getState('') });
              return;
            }

            if (msg.setting === 'siteFeature') {
              const state = await protectionManager.setSiteFeature(domain, msg.feature, msg.enabled);
              sendResponse({ ok: true, state });
              return;
            }

            if (msg.setting === 'siteDeviceAllow') {
              const state = await protectionManager.setSiteDeviceAllow(domain, msg.feature, msg.enabled);
              sendResponse({ ok: true, state });
              return;
            }

            await protectionManager.setGlobal(msg.setting, msg.enabled);
            sendResponse({ ok: true, state: protectionManager.getState(domain) });
          } catch (settingError) {
            console.error(`[SentinelShield] Could not update ${String(msg.setting)}:`, settingError);
            sendResponse({ ok: false, error: settingError.message });
          }
        });
        return true;
      }

      // ── Event: Content script reporting blocked item(s) ──
      if (msg.type === 'ss-stat') {
        if (!sender.tab || typeof sender.tab.id !== 'number') return false;
        const category = msg.category;
        const count = (typeof msg.count === 'number' && msg.count > 0) ? msg.count : 1;
        const tabId = sender.tab.id;
        const tabUrl = sender.tab.url || '';

        stateManager.increment(category, count, tabId, tabUrl);

        if (typeof tabId === 'number' && tabId >= 0) {
          badgeManager.updateBadgeForTab(tabId);
        }
        return false;
      }

      // ── Event: Content script reporting active site URL ──
      if (msg.type === 'ss-site') {
        // Only accept if from top frame (frameId === 0 or undefined)
        if (sender.frameId !== 0 && sender.frameId !== undefined) return false;
        const tabId = sender.tab && sender.tab.id;
        const url = (sender.tab && sender.tab.url) || msg.url || '';
        if (typeof tabId === 'number' && tabId >= 0 && url) {
          stateManager.setTabUrl(tabId, url);
        }
        return false;
      }

      // ── Request: Popup requesting current statistics ──
      if (msg.type === 'ss-get-stats') {
        if (!isPopup) return false;
        const tabId = msg.tabId;
        const stats = stateManager.getStats(tabId);
        sendResponse(stats);
        return false;
      }

      // ── Request: Popup requesting DNS security status ──
      if (msg.type === 'ss-get-dns-status') {
        if (!isPopup) return false;
        const tabId = msg.tabId;
        let targetDomain = (typeof msg.domain === 'string' && msg.domain.trim()) || '';
        if (!targetDomain && typeof msg.url === 'string') {
          try {
            const u = new URL(msg.url);
            if (u.protocol === 'http:' || u.protocol === 'https:') {
              targetDomain = u.hostname;
            }
          } catch (_) {}
        }

        // Fast-path: Check domain cache first
        if (targetDomain) {
          const cachedDomain = dnsSecurity.getCachedDomainStatus(targetDomain);
          if (cachedDomain) {
            sendResponse(cachedDomain);
            return false;
          }
        }

        // Fast-path: Check per-tab security cache
        const status = dnsSecurity.getTabSecurityStatus(tabId);
        if (status && (!targetDomain || status.domain === targetDomain)) {
          sendResponse(status);
          return false;
        }

        // Status not cached yet: actively resolve
        (async () => {
          try {
            let domainToValidate = targetDomain;
            if (!domainToValidate) {
              const stats = stateManager.getStats(tabId);
              let rawUrl = (stats && stats.tabStats && stats.tabStats.url) || '';
              if (!rawUrl && typeof tabId === 'number') {
                const tab = await chrome.tabs.get(tabId).catch(() => null);
                rawUrl = tab ? tab.url : '';
              }
              if (rawUrl) {
                const parsed = new URL(rawUrl);
                if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                  domainToValidate = parsed.hostname;
                }
              }
            }

            if (domainToValidate) {
              const res = await dnsSecurity.validateDomain(domainToValidate, tabId);
              sendResponse(res || null);
              return;
            }
          } catch (_) {}
          sendResponse(null);
        })();
        return true; // Keep channel open for async response
      }

      // ── Request: Popup requesting counter reset ──
      if (msg.type === 'ss-reset') {
        if (!isPopup) return false;
        (async () => {
          try {
            await stateManager.resetAll();
            await badgeManager.clearAllBadges();
            sendResponse({ ok: true });
          } catch (error) {
            console.error('[SentinelShield] Could not reset statistics:', error);
            sendResponse({ ok: false });
          }
        })();
        return true; // Keep channel open for async response
      }

      return false;
    });
  }
};
