// content/cosmetic/iframe-filter.js
// Identifies and filters iframe elements loading from known ad and tracking networks.

(() => {
  'use strict';

  window.__SS_CONTENT = window.__SS_CONTENT || {};

  const BLOCKED_IFRAME_HOSTS = [
    // Standard ad exchanges
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'adnxs.com',
    'rubiconproject.com',
    'pubmatic.com',
    'openx.net',
    'criteo.com',
    'criteo.net',
    'casalemedia.com',
    '33across.com',
    'sharethrough.com',
    'smartadserver.com',
    'taboola.com',
    'outbrain.com',
    'revcontent.com',
    'mgid.com',
    'zergnet.com',
    // Pop / Redirect / Push ad networks
    'propellerads.com',
    'popads.net',
    'popcash.net',
    'adsterra.com',
    'adcash.com',
    'exoclick.com',
    'juicyads.com',
    'trafficjunky.net',
    'trafficstars.com',
    // Streaming ad networks & redirect targets
    'kettledroopingcontinuation.com',
    'highperformanceformat.com',
    'tagivi.com',
    'createlouisville.org',
    'interlinecustomroofingllc.com',
    'surlyplants.com',
    'pufted.com',
    'medium-while.com',
    'quizzical-topic.com',
    'cdn.tsyndicate.com',
    '5gvci.com',
    'nap5k.com',
    'richinfo.co',
    'aarems.org',
    'bancadeltempoidea.org'
  ];

  window.__SS_CONTENT.IframeFilter = {
    isBlockedIframe(iframe) {
      if (!iframe || iframe.tagName !== 'IFRAME') return false;

      // 1. Container id or class heuristic
      const id = iframe.getAttribute && iframe.getAttribute('id');
      const cls = iframe.getAttribute && iframe.getAttribute('class');
      if (typeof id === 'string' && id.startsWith('container-')) return true;
      if (typeof cls === 'string' && cls.split(/\s+/).some(c => c.startsWith('container-'))) return true;

      // 2. Src check
      const src = iframe.getAttribute && iframe.getAttribute('src');
      if (src) {
        try {
          const u = new URL(src, location.href);
          if (BLOCKED_IFRAME_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) {
            return true;
          }
        } catch (_) {
          if (BLOCKED_IFRAME_HOSTS.some(h => src.includes(h))) {
            return true;
          }
        }
      }

      // 3. Srcdoc check
      const srcdoc = iframe.getAttribute && iframe.getAttribute('srcdoc');
      if (srcdoc && BLOCKED_IFRAME_HOSTS.some(h => srcdoc.includes(h))) {
        return true;
      }

      return false;
    }
  };
})();
