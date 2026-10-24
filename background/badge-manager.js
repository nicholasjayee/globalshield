// background/badge-manager.js
// Manages toolbar icon badges and indicators.

'use strict';

import { stateManager } from './state-manager.js';

export const badgeManager = {
  updateBadgeForTab(tabId) {
    if (typeof tabId !== 'number' || tabId < 0) return;

    const count = stateManager.getTabTotal(tabId);
    const text = count === 0 ? '' : (count > 999 ? '999+' : String(count));

    chrome.action.setBadgeText({ tabId, text }, () => {
      void chrome.runtime.lastError;
    });

    chrome.action.setBadgeBackgroundColor({ tabId, color: '#e5484d' }, () => {
      void chrome.runtime.lastError;
    });
  },

  async clearAllBadges() {
    try {
      const tabs = await chrome.tabs.query({});
      for (const t of tabs) {
        if (typeof t.id === 'number') {
          chrome.action.setBadgeText({ tabId: t.id, text: '' }, () => {
            void chrome.runtime.lastError;
          });
        }
      }
    } catch (_) {}
  }
};
