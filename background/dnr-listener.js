// Listens for DeclarativeNetRequest rule match feedback (available in development/debug).

'use strict';

import { stateManager } from './state-manager.js';
import { badgeManager } from './badge-manager.js';

const classifyRule = (rulesetId, ruleId) => {
  if (!Number.isInteger(ruleId)) return null;

  if (rulesetId === 'rules_streaming') {
    return ruleId >= 101 && ruleId <= 125 ? 'ad_requests' : null;
  }

  if (rulesetId !== 'rules_global') return null;
  if ((ruleId >= 1 && ruleId <= 34) || (ruleId >= 146 && ruleId <= 157)) return 'ad_requests';
  if (ruleId >= 35 && ruleId <= 54) return 'trackers';
  if (ruleId >= 55 && ruleId <= 57) return 'fingerprinters';
  if (ruleId >= 95 && ruleId <= 101) return 'privacy';
  if (ruleId >= 130 && ruleId <= 134) return 'private_network';

  // Rules 90-94 strip URL parameters or adjust request headers; rule 200 upgrades scheme.
  return null;
};

export const dnrListener = {
  init() {
    if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.onRuleMatchedDebug) {
      return;
    }

    try {
      chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
        if (!info || !info.request) return;

        const tabId = info.request.tabId;
        const rulesetId = info.rule && info.rule.rulesetId;
        const ruleId = info.rule && info.rule.ruleId;
        const category = classifyRule(rulesetId, ruleId);
        if (!category) return;

        if (typeof tabId === 'number' && tabId >= 0) {
          stateManager.increment(category, 1, tabId);
          badgeManager.updateBadgeForTab(tabId);
        } else {
          stateManager.increment(category, 1);
        }
      });
      console.log('[SentinelShield] DNR debug listener registered');
    } catch (error) {
      console.warn('[SentinelShield] DNR debug listener could not be registered:', error);
    }
  }
};
