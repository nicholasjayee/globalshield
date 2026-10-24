// main-world/config.js
// Central configuration for main-world guards, blocked hosts, and target sites.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const protectionEnabled = {
    pageGuards: true,
    antiFingerprinting: true
  };

  window.addEventListener('ss-device-protection-settings', (event) => {
    const settings = event.detail;
    if (!settings || settings.domain !== location.hostname.toLowerCase()) return;
    protectionEnabled.pageGuards = settings.pageGuardsEnabled !== false;
    protectionEnabled.antiFingerprinting = settings.antiFingerprintingEnabled !== false;
  });

  // Streaming targets requiring specialized media & bypass handling
  const STREAMING_DOMAINS = [
    'movieboxhd.net',
    'mzfi.me',
    'aoneroom.com',
    'themoviebox.xyz'
  ];

  // Ad, tracker, telemetry, cryptominer, and malicious redirect hosts
  const BLOCKED_HOSTS = [
    // Streaming & Adsterra / Popunder networks
    'pufted.com',
    'medium-while.com',
    'quizzical-topic.com',
    'surlyplants.com',
    'hisavana.com',
    'tagivi.com',
    'createlouisville.org',
    'interlinecustomroofingllc.com',
    'cdn.tsyndicate.com',
    '5gvci.com',
    'nap5k.com',
    'richinfo.co',
    'kettledroopingcontinuation.com',
    'highperformanceformat.com',
    'clicks.pipaffiliates.com',
    'cdn.storageimagedisplay.com',
    'aarems.org',
    'bancadeltempoidea.org',
    'trasre.com',
    // Generic high-confidence advertising & tracking domains
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'googletagservices.com',
    'propellerads.com',
    'popads.net',
    'popcash.net',
    'exoclick.com',
    'adcash.com',
    'adsterra.com',
    'adnxs.com',
    'criteo.com',
    'criteo.net',
    'rubiconproject.com',
    'pubmatic.com',
    'openx.net',
    'casalemedia.com',
    'taboola.com',
    'outbrain.com',
    'revcontent.com',
    'mgid.com',
    'zergnet.com',
    'juicyads.com',
    'trafficjunky.net',
    'trafficstars.com',
    // In-browser cryptominers
    'coinhive.com',
    'crypto-loot.com',
    'coin-have.com'
  ];

  const BLOCKED_PATHS = ['/athena-unify.js'];

  // Moviebox ad config API endpoint
  const AD_CONFIG_SUBSTR = 'ad/get-config';

  // Bogon & Private IP regex (RFC 1918, Loopback, Link-Local, Cloud Metadata, CGNAT, IPv6 local)
  const BOGON_HOST_REGEX = /^(0\.|10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.|localhost(?:\.|$)|\[::\]|\[::1\]|\[fc[0-9a-f]*:|\[fd[0-9a-f]*:|\[fe[89ab][0-9a-f]*:)/i;

  const isMappedPrivateIpv4 = (host) => {
    const ipv6 = host.replace(/^\[|\]$/g, '');
    const mapped = ipv6.match(/^::ffff:(?:(\d{1,3}(?:\.\d{1,3}){3})|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/i);
    if (!mapped) return false;
    if (mapped[1]) return BOGON_HOST_REGEX.test(mapped[1]);
    const high = parseInt(mapped[2], 16);
    const low = parseInt(mapped[3], 16);
    const address = [high >> 8, high & 255, low >> 8, low & 255].join('.');
    return BOGON_HOST_REGEX.test(address);
  };

  const isHostPrivateOrBogon = (host) => {
    if (!host) return false;
    const clean = host.toLowerCase().trim();
    return clean === 'localhost' || clean.endsWith('.local') ||
      clean.endsWith('.internal') || clean.endsWith('.localhost') ||
      BOGON_HOST_REGEX.test(clean) || isMappedPrivateIpv4(clean);
  };

  const isCurrentPagePrivate = () => {
    return isHostPrivateOrBogon(location.hostname);
  };

  window.__SS_MAIN.Config = {
    STREAMING_DOMAINS,
    BLOCKED_HOSTS,
    AD_CONFIG_SUBSTR,
    isProtectionEnabled(feature) {
      return protectionEnabled[feature] !== false;
    },

    isStreamingTarget(hostname = location.hostname) {
      if (!hostname) return false;
      return STREAMING_DOMAINS.some(domain =>
        hostname === domain || hostname.endsWith('.' + domain)
      );
    },

    isBlockedHost(url) {
      if (!url) return false;
      let parsed;
      try {
        parsed = new URL(String(url), location.href);
      } catch (_) {
        return false;
      }
      const hostname = parsed.hostname.toLowerCase();
      return BLOCKED_HOSTS.some(host =>
        hostname === host || hostname.endsWith('.' + host)
      ) || BLOCKED_PATHS.some(path => parsed.pathname.toLowerCase().includes(path));
    },

    isAdConfig(url) {
      if (!url) return false;
      return String(url).includes(AD_CONFIG_SUBSTR);
    },

    isPrivateOrLoopbackHost(url) {
      if (!url) return false;
      try {
        const parsed = new URL(String(url), location.href);
        return isHostPrivateOrBogon(parsed.hostname);
      } catch (_) {
        return false;
      }
    },

    // Blocks direct requests to local/private address literals from public pages.
    // Hostname-based DNS rebinding cannot be verified from page JavaScript.
    isPrivateNetworkRequest(url) {
      if (!url) return false;
      // Allow local development pages to access their own local services.
      if (isCurrentPagePrivate()) return false;
      return this.isPrivateOrLoopbackHost(url);
    }
  };
})();
