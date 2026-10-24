// background/dns-security.js
// Out-of-band DNS-over-HTTPS (DoH) response comparison and non-public IP detection.

'use strict';

import { isBogonIp, isIpAddress, summarizeDnsResponses } from './dns-utils.js';

// DNS responses are sent to these providers to compare public resolver views.
const DOH_RESOLVERS = [
  {
    name: 'Cloudflare',
    url: 'https://cloudflare-dns.com/dns-query'
  },
  {
    name: 'Google',
    url: 'https://dns.google/resolve'
  },
  {
    name: 'AdGuard',
    url: 'https://dns.adguard-dns.com/resolve'
  }
];

// In-memory cache for informational DoH comparisons; these checks do not gate navigation.
const dnsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_CACHE_KEY = 'ss_dns_cache_v2';

// In-flight query deduplication to prevent racing promises
const inFlightQueries = new Map();

// Per-tab DNS response comparison status.
const tabSecurityStatus = new Map();

const sanitizeDomain = (domain) => {
  if (!domain || typeof domain !== 'string') return '';
  let d = domain.trim().toLowerCase();
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(d)) {
    try {
      d = new URL(d).hostname;
    } catch (_) {
      return '';
    }
  }
  d = d.split('/')[0];
  if (d.startsWith('[') && d.endsWith(']')) d = d.slice(1, -1);
  else if ((d.match(/:/g) || []).length === 1) d = d.replace(/:\d+$/, '');
  return d.replace(/\.$/, '');        // strip trailing dot
};

// Helper to query a single DoH provider with timeout
const queryDoH = async (resolver, domain, recordType) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const url = new URL(resolver.url);
    url.searchParams.set('name', domain);
    url.searchParams.set('type', String(recordType.id));
    url.searchParams.set('do', '1'); // Request DNSSEC records

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/dns-json'
      },
      signal: controller.signal
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    if (!data || !Number.isInteger(data.Status)) return null;
    const answers = (data && Array.isArray(data.Answer)) ? data.Answer : [];
    const ips = answers
      .filter(rec => rec.type === recordType.id && typeof rec.data === 'string')
      .map(rec => rec.data.trim())
      .filter(isIpAddress);

    return {
      resolver: resolver.name,
      recordType: recordType.name,
      status: data.Status,
      dnssec: data.AD === true,
      ips
    };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const dnsSecurity = {
  async init() {
    try {
      if (chrome.storage && chrome.storage.session) {
        const stored = await chrome.storage.session.get(SESSION_CACHE_KEY);
        if (stored && stored[SESSION_CACHE_KEY] && typeof stored[SESSION_CACHE_KEY] === 'object') {
          const now = Date.now();
          for (const [dom, verdict] of Object.entries(stored[SESSION_CACHE_KEY])) {
            if (verdict && now - verdict.timestamp < CACHE_TTL_MS) {
              dnsCache.set(dom, verdict);
            }
          }
        }
      }
    } catch (_) {}
  },

  getCachedDomainStatus(domain) {
    if (!domain || typeof domain !== 'string') return null;
    const cleanDomain = sanitizeDomain(domain);
    const now = Date.now();
    const cached = dnsCache.get(cleanDomain);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached;
    }
    return null;
  },

  async validateDomain(domain, tabId = null) {
    if (!domain || typeof domain !== 'string') return null;

    const cleanDomain = sanitizeDomain(domain);
    if (!cleanDomain) return null;

    if (cleanDomain === 'localhost' || isBogonIp(cleanDomain) ||
        cleanDomain.endsWith('.local') || cleanDomain.endsWith('.internal')) {
      return {
        domain: cleanDomain,
        consensus: true,
        dnssec: false,
        status: 'local',
        bogonDetected: false
      };
    }
    if (isIpAddress(cleanDomain)) {
      return {
        domain: cleanDomain,
        consensus: true,
        dnssec: false,
        status: 'ip_literal',
        bogonDetected: false
      };
    }

    const now = Date.now();
    const cached = dnsCache.get(cleanDomain);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      if (tabId !== null) {
        tabSecurityStatus.set(tabId, cached);
      }
      return cached;
    }

    // Reuse in-flight query promise if already running
    if (inFlightQueries.has(cleanDomain)) {
      const pendingVerdict = await inFlightQueries.get(cleanDomain);
      if (tabId !== null && pendingVerdict) {
        tabSecurityStatus.set(tabId, pendingVerdict);
      }
      return pendingVerdict;
    }

    const runValidation = async () => {
      try {
        // Query independent DoH providers concurrently
        const recordTypes = [{ name: 'A', id: 1 }, { name: 'AAAA', id: 28 }];
        const expectedResponseCount = DOH_RESOLVERS.length * recordTypes.length;
        const queries = DOH_RESOLVERS.flatMap(resolver =>
          recordTypes.map(recordType => queryDoH(resolver, cleanDomain, recordType))
        );
        const results = (await Promise.all(queries)).filter(Boolean);
        const verdict = summarizeDnsResponses(cleanDomain, results, expectedResponseCount, now);

        if (verdict.bogonDetected) {
          console.warn(`[SentinelShield] Public DNS resolver returned a non-public IP for ${cleanDomain}`);
        } else if (verdict.status === 'divergence_alert') {
          console.warn(`[SentinelShield] DNS response-code disagreement for ${cleanDomain}`);
        } else if (verdict.status === 'answers_differ') {
          console.info(`[SentinelShield] Public DNS answers vary for ${cleanDomain}; this can be normal for CDN or geographic DNS`);
        }

        dnsCache.set(cleanDomain, verdict);
        if (tabId !== null) {
          tabSecurityStatus.set(tabId, verdict);
        }

        // Persist session cache for service worker restarts
        try {
          if (chrome.storage && chrome.storage.session) {
            const cacheObj = Object.fromEntries(dnsCache.entries());
            chrome.storage.session.set({ [SESSION_CACHE_KEY]: cacheObj }).catch(() => {});
          }
        } catch (_) {}

        return verdict;
      } finally {
        inFlightQueries.delete(cleanDomain);
      }
    };

    const promise = runValidation();
    inFlightQueries.set(cleanDomain, promise);
    return promise;
  },

  getTabSecurityStatus(tabId) {
    if (typeof tabId !== 'number') return null;
    return tabSecurityStatus.get(tabId) || null;
  },

  removeTab(tabId) {
    tabSecurityStatus.delete(tabId);
  }
};
