// main-world/dom/clipboard-guard.js
// Guards against clipboard hijacking, unauthorized background reads, and crypto-clipper address substitution.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;

  // Patterns for cryptocurrency addresses commonly targeted by web clippers
  const CRYPTO_ADDR_PATTERNS = [
    /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/, // Bitcoin
    /^0x[a-fA-F0-9]{40}$/,                  // Ethereum / ERC-20
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,        // Solana
    /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/    // Litecoin
  ];

  const looksLikeCryptoAddress = (str) => {
    if (!str || typeof str !== 'string') return false;
    const clean = str.trim();
    return CRYPTO_ADDR_PATTERNS.some(re => re.test(clean));
  };

  // Malicious terminal/command-line payload pattern (PowerShell / bash curl|sh)
  const isMaliciousShellCommand = (str) => {
    if (!str || typeof str !== 'string') return false;
    return /(powershell(\.exe)?|cmd(\.exe)?|curl\s+.*\|\s*(bash|sh)|iex\s*\(|wget\s+.*\|\s*sh)/i.test(str);
  };

  window.__SS_MAIN.ClipboardGuard = {
    init() {
      // 1. Guard navigator.clipboard API
      if (navigator.clipboard) {
        // (a) Guard clipboard.readText (prevent background snooping)
        if (navigator.clipboard.readText) {
          const origReadText = navigator.clipboard.readText;
          navigator.clipboard.readText = function () {
            if (!Config.isProtectionEnabled('pageGuards')) {
              return origReadText.call(navigator.clipboard);
            }
            if (!document.hasFocus()) {
              console.warn('[SentinelShield] Blocked background clipboard read attempt');
              EventBridge.reportHijackBlocked('clipboard-read-blocked');
              return Promise.reject(new DOMException('Blocked by SentinelShield', 'NotAllowedError'));
            }
            return origReadText.call(navigator.clipboard);
          };
        }

        // (b) Guard clipboard.writeText (prevent clipper replacement with ad links or rogue addresses)
        if (navigator.clipboard.writeText) {
          const origWriteText = navigator.clipboard.writeText;
          navigator.clipboard.writeText = function (text) {
            if (!Config.isProtectionEnabled('pageGuards')) {
              return origWriteText.call(navigator.clipboard, text);
            }
            const str = String(text || '');
            if (Config.isBlockedHost(str)) {
              console.warn('[SentinelShield] Blocked malicious clipboard write (ad URL):', str);
              EventBridge.reportHijackBlocked('clipboard-write-ad-blocked');
              return Promise.reject(new DOMException('Blocked by SentinelShield', 'NotAllowedError'));
            }
            if (isMaliciousShellCommand(str)) {
              console.warn('[SentinelShield] Blocked malicious clipboard shell payload injection');
              EventBridge.reportHijackBlocked('clipboard-shell-payload-blocked');
              return Promise.reject(new DOMException('Blocked by SentinelShield', 'NotAllowedError'));
            }
            return origWriteText.call(navigator.clipboard, text);
          };
        }
      }

      // 2. Capture-phase 'copy' & 'cut' event inspection against clipboard hijacking & clippers
      window.addEventListener('copy', (e) => {
        if (!Config.isProtectionEnabled('pageGuards')) return;
        if (!e.clipboardData) return;

        const origSetData = e.clipboardData.setData;
        e.clipboardData.setData = function (format, data) {
          if (format === 'text/plain' || format === 'text') {
            const selectedText = window.getSelection ? window.getSelection().toString() : '';
            const replacementText = String(data || '');

            // Detect unauthorized substitution with ad URL
            if (Config.isBlockedHost(replacementText)) {
              console.warn('[SentinelShield] Blocked copy event ad-link injection');
              EventBridge.reportHijackBlocked('copy-ad-injection-blocked');
              return origSetData.call(this, format, selectedText);
            }

            // Detect stealth cryptocurrency clipper replacement
            if (looksLikeCryptoAddress(replacementText) && selectedText && !selectedText.includes(replacementText)) {
              console.warn('[SentinelShield] Blocked crypto-clipper address substitution');
              EventBridge.reportHijackBlocked('crypto-clipper-swap-blocked');
              return origSetData.call(this, format, selectedText);
            }

            // Detect shell code clipboard injection
            if (isMaliciousShellCommand(replacementText) && !selectedText.includes(replacementText)) {
              console.warn('[SentinelShield] Blocked stealth shell command copy injection');
              EventBridge.reportHijackBlocked('copy-shell-hijack-blocked');
              return origSetData.call(this, format, selectedText);
            }
          }
          return origSetData.call(this, format, data);
        };
      }, true);

      console.log('[SentinelShield] Advanced clipboard & clipper protection active');
    }
  };
})();
