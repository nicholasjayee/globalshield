// main-world/dom/element-guard.js
// Traps DOM insertion and attribute mutations to block ad scripts, container-iframes,
// base tag hijacking, form action hijacking, and enforce reverse tabnabbing protection.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;

  const isSuspiciousIframe = (node) => {
    if (!node || node.nodeType !== 1 || node.tagName !== 'IFRAME') return false;

    // Check id or class for Adsterra/pop-under container signatures
    const id = node.getAttribute && node.getAttribute('id');
    const cls = node.getAttribute && node.getAttribute('class');
    if (typeof id === 'string' && id.startsWith('container-')) return true;
    if (typeof cls === 'string' && cls.split(/\s+/).some(c => c.startsWith('container-'))) return true;

    // Check style attribute for astronomical z-index
    const styleAttr = (node.getAttribute && node.getAttribute('style')) || '';
    if (
      /position\s*:\s*fixed/i.test(styleAttr) &&
      /z-index\s*:\s*2\d{9}/i.test(styleAttr)
    ) return true;

    // Check computed or inline style object
    const s = node.style;
    if (s && s.position === 'fixed') {
      const z = parseInt(s.zIndex, 10);
      if (z >= 2147483000) return true;
    }

    return false;
  };

  const sanitizeAnchor = (anchor) => {
    if (anchor && anchor.tagName === 'A') {
      const target = anchor.getAttribute('target');
      if (target === '_blank') {
        const rel = anchor.getAttribute('rel') || '';
        if (!rel.includes('noopener')) {
          anchor.setAttribute('rel', (rel + ' noopener noreferrer').trim());
        }
      }
    }
  };

  const shouldDropNode = (node) => {
    if (!Config.isProtectionEnabled('pageGuards')) return false;
    if (!node || node.nodeType !== 1) return false;

    // 1. Script element checks
    if (node.tagName === 'SCRIPT') {
      const src = node.getAttribute && node.getAttribute('src');
      if (src && Config.isBlockedHost(src)) {
        console.warn('[SentinelShield] Blocked ad script injection:', src);
        EventBridge.reportScriptBlocked(src);
        return true;
      }
    }

    // 2. Iframe element checks
    if (node.tagName === 'IFRAME') {
      const srcdoc = node.getAttribute && node.getAttribute('srcdoc');
      if (srcdoc && Config.isBlockedHost(srcdoc)) {
        console.warn('[SentinelShield] Blocked srcdoc iframe with ad content');
        EventBridge.reportScriptBlocked('srcdoc-ad-iframe');
        return true;
      }

      const src = node.getAttribute && node.getAttribute('src');
      if (src && Config.isBlockedHost(src)) {
        console.warn('[SentinelShield] Blocked ad iframe injection:', src);
        EventBridge.reportScriptBlocked(src);
        return true;
      }

      if (isSuspiciousIframe(node)) {
        console.warn('[SentinelShield] Blocked suspicious container-iframe:', node.id || node.className);
        EventBridge.reportScriptBlocked('container-iframe');
        return true;
      }
    }

    // 3. Base tag hijacking check (<base href="..."> pointing to external domain)
    if (node.tagName === 'BASE') {
      const href = node.getAttribute && node.getAttribute('href');
      if (href) {
        try {
          const u = new URL(href, location.href);
          if (u.origin !== location.origin) {
            console.warn('[SentinelShield] Blocked malicious cross-origin <base> tag hijacking:', href);
            EventBridge.reportHijackBlocked('base-href-hijack-blocked');
            return true;
          }
        } catch (_) {}
      }
    }

    // 4. Reverse tabnabbing check on anchors
    if (node.tagName === 'A') {
      sanitizeAnchor(node);
    }

    return false;
  };

  window.__SS_MAIN.ElementGuard = {
    init() {
      // ── 1. Element.prototype.appendChild ──
      const nativeAppend = Element.prototype.appendChild;
      Element.prototype.appendChild = function (node) {
        if (shouldDropNode(node)) {
          return node;
        }
        return nativeAppend.call(this, node);
      };

      // ── 2. Element.prototype.insertBefore ──
      const nativeInsertBefore = Element.prototype.insertBefore;
      Element.prototype.insertBefore = function (newNode, refNode) {
        if (shouldDropNode(newNode)) {
          return newNode;
        }
        return nativeInsertBefore.call(this, newNode, refNode);
      };

      // ── 3. Element.prototype.setAttribute ──
      const nativeSetAttr = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) {
        if (!Config.isProtectionEnabled('pageGuards')) {
          return nativeSetAttr.call(this, name, value);
        }
        const valStr = String(value || '');
        const lowerName = name.toLowerCase();

        if (this.tagName === 'SCRIPT' && lowerName === 'src') {
          if (Config.isBlockedHost(valStr)) {
            console.warn('[SentinelShield] Blocked script.src setAttribute:', valStr);
            EventBridge.reportScriptBlocked(valStr);
            return;
          }
        }

        if (this.tagName === 'IFRAME') {
          if (lowerName === 'srcdoc' && Config.isBlockedHost(valStr)) {
            console.warn('[SentinelShield] Blocked iframe srcdoc setAttribute');
            EventBridge.reportScriptBlocked('srcdoc-attribute');
            return;
          }
          if ((lowerName === 'id' || lowerName === 'class') &&
              valStr.split(/\s+/).some(c => c.startsWith('container-'))) {
            console.warn('[SentinelShield] Blocked suspicious iframe id/class setAttribute:', valStr);
            EventBridge.reportScriptBlocked('container-attr');
            return;
          }
          if (lowerName === 'style' &&
              /position\s*:\s*fixed/i.test(valStr) &&
              /z-index\s*:\s*2\d{9}/i.test(valStr)) {
            console.warn('[SentinelShield] Blocked suspicious iframe style setAttribute');
            EventBridge.reportScriptBlocked('container-style');
            return;
          }
        }

        // Form Action Hijacking Protection
        if (this.tagName === 'FORM' && lowerName === 'action') {
          if (Config.isBlockedHost(valStr)) {
            console.warn('[SentinelShield] Blocked form action rewrite to ad host:', valStr);
            EventBridge.reportHijackBlocked('form-action-ad-blocked');
            return;
          }
        }

        // Reverse tabnabbing enforcement on target="_blank"
        if (this.tagName === 'A' && lowerName === 'target' && valStr === '_blank') {
          const currentRel = this.getAttribute('rel') || '';
          if (!currentRel.includes('noopener')) {
            nativeSetAttr.call(this, 'rel', (currentRel + ' noopener noreferrer').trim());
          }
        }

        return nativeSetAttr.call(this, name, value);
      };

      console.log('[SentinelShield] Advanced DOM Element & reverse-tabnabbing guard active');
    }
  };
})();
