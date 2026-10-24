// background/index.js
// SentinelShield MV3 Service Worker Entrypoint.

'use strict';

import { stateManager } from './state-manager.js';
import { badgeManager } from './badge-manager.js';
import { messageRouter } from './message-router.js';
import { privacyManager } from './privacy-manager.js';
import { dnrListener } from './dnr-listener.js';
import { dnsSecurity } from './dns-security.js';
import { protectionManager } from './protection-manager.js';

// Initialize services
(async () => {
  await stateManager.init();
  await privacyManager.init();
  await dnsSecurity.init();
  await protectionManager.init();
  messageRouter.init();
  dnrListener.init();

  // Tab closed: clean up session memory
  chrome.tabs.onRemoved.addListener((tabId) => {
    stateManager.removeTab(tabId);
    dnsSecurity.removeTab(tabId);
  });

  // Tab updated: keep active URL current without sending browsing domains to DNS providers.
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const rawUrl = changeInfo.url || (changeInfo.status === 'complete' ? tab?.url : null);
    if (rawUrl) {
      stateManager.setTabUrl(tabId, rawUrl);
      badgeManager.updateBadgeForTab(tabId);
    }
  });

  // Tab activated: update badge only; DNS comparisons are requested from the popup.
  chrome.tabs.onActivated.addListener((activeInfo) => {
    badgeManager.updateBadgeForTab(activeInfo.tabId);
  });

  // Install / update logging
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[SentinelShield] Extension lifecycle event:', details.reason);
    await privacyManager.init();
  });

  console.log('[SentinelShield] Background service worker initialized');
})();
