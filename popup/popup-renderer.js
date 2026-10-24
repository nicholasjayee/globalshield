// popup/popup-renderer.js
// Handles UI rendering, numerical formatting, domain status badges, and DNS security state.

'use strict';

const STREAMING_DOMAINS = [
  'movieboxhd.net',
  'mzfi.me',
  'aoneroom.com',
  'themoviebox.xyz'
];

export const formatNumber = (n) => {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
};

export const extractHostname = (url) => {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch (_) {
    return url;
  }
};

export const isStreamingTarget = (hostname) => {
  if (!hostname) return false;
  return STREAMING_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
};

export const sumCategories = (stats) => {
  if (!stats) return 0;
  return (stats.ad_requests || 0) +
         (stats.ad_elements || 0) +
         (stats.ads || 0) +
         (stats.trackers || 0) +
         (stats.fingerprinters || 0) +
         (stats.privacy || 0) +
         (stats.malicious || 0) +
         (stats.popups || 0) +
         (stats.scripts || 0) +
         (stats.overlays || 0) +
         (stats.private_network || 0) +
         (stats.hijack || 0);
};

export const popupRenderer = {
  render(elements, { totals, tabStats, dnsStatus, currentUrl }) {
    // ── 1. Global all-time total ──
    const totalCount = sumCategories(totals);
    if (elements.totalCount) {
      elements.totalCount.textContent = `${formatNumber(totalCount)} all-time`;
    }

    // ── 2. Active Tab Stats & Mode ──
    const tabUrl = currentUrl || (tabStats && tabStats.url) || '';
    const host = extractHostname(tabUrl);
    if (elements.tabUrl) {
      elements.tabUrl.textContent = host ? host : 'Internal Page';
    }

    if (elements.modePill) {
      const streamingActive = isStreamingTarget(host);
      if (streamingActive) {
        elements.modePill.textContent = 'code8 Shield';
        elements.modePill.className = 'mode-pill streaming';
      } else {
        elements.modePill.textContent = 'Global Shield';
      }
    }

    const tabTotal = sumCategories(tabStats);
    if (elements.tabCount) {
      elements.tabCount.textContent = `${formatNumber(tabTotal)} page`;
      elements.tabCount.className = tabTotal === 0 ? 'stat-badge page empty' : 'stat-badge page';
    }

    // ── 3. Informational DNS response comparison ──
    if (elements.dnsPill) {
      if (!host || host === 'Internal Page' || (dnsStatus && dnsStatus.status === 'local')) {
        elements.dnsPill.textContent = 'Local';
        elements.dnsPill.className = 'dns-pill local';
        elements.dnsPill.title = 'Internal page or local hostname; no public DNS comparison was performed';
      } else if (dnsStatus && dnsStatus.status === 'ip_literal') {
        elements.dnsPill.textContent = 'IP literal';
        elements.dnsPill.className = 'dns-pill local';
        elements.dnsPill.title = 'The site address is an IP literal; no DNS comparison was performed';
      } else if (dnsStatus) {
        if (dnsStatus.status === 'non_public_answer') {
          elements.dnsPill.textContent = 'Private IP answer';
          elements.dnsPill.className = 'dns-pill danger';
          elements.dnsPill.title = 'At least one public resolver returned a non-public IP address. This is a warning, not proof of an attack.';
        } else if (dnsStatus.status === 'divergence_alert') {
          elements.dnsPill.textContent = 'NXDOMAIN mismatch';
          elements.dnsPill.className = 'dns-pill warning';
          elements.dnsPill.title = 'Some DNS responses reported NXDOMAIN while others returned an address. This does not identify the cause.';
        } else if (dnsStatus.status === 'answers_differ') {
          elements.dnsPill.textContent = 'Answers differ';
          elements.dnsPill.className = 'dns-pill warning';
          elements.dnsPill.title = 'Public resolvers returned different IP sets. This is common with CDNs and geographic DNS and is not proof of an attack.';
        } else if (dnsStatus.status === 'partial') {
          elements.dnsPill.textContent = 'Partial check';
          elements.dnsPill.className = 'dns-pill warning';
          elements.dnsPill.title = `Received ${dnsStatus.responseCount || 0} of 6 DNS responses; no full comparison is available.`;
        } else if (dnsStatus.status === 'resolver_error') {
          elements.dnsPill.textContent = 'DNS error';
          elements.dnsPill.className = 'dns-pill warning';
          elements.dnsPill.title = 'One or more DNS resolvers returned an error response.';
        } else if (dnsStatus.status === 'nxdomain') {
          elements.dnsPill.textContent = 'NXDOMAIN';
          elements.dnsPill.className = 'dns-pill local';
          elements.dnsPill.title = 'All queried resolvers reported that this name does not exist.';
        } else if (dnsStatus.status === 'no_address') {
          elements.dnsPill.textContent = 'No address';
          elements.dnsPill.className = 'dns-pill local';
          elements.dnsPill.title = 'Resolvers responded, but no A or AAAA address was returned.';
        } else if (dnsStatus.status === 'consistent') {
          elements.dnsPill.textContent = dnsStatus.dnssec ? 'DNSSEC validated' : 'Resolvers agree';
          elements.dnsPill.className = 'dns-pill secure';
          elements.dnsPill.title = `Cloudflare, Google, and AdGuard returned consistent responses${dnsStatus.dnssec ? ' with DNSSEC authenticated-data (AD) flags' : ''}. This is not a reputation or safe-browsing check.`;
        } else {
          elements.dnsPill.textContent = 'Check unavailable';
          elements.dnsPill.className = 'dns-pill warning';
          elements.dnsPill.title = 'No complete DNS response comparison is available.';
        }
      } else {
        elements.dnsPill.textContent = 'Checking';
        elements.dnsPill.className = 'dns-pill verifying';
        elements.dnsPill.title = 'Comparing A and AAAA answers from Cloudflare, Google, and AdGuard. The domain is sent to those DNS providers.';
      }
    }

    // ── 4. Category Breakdown (Active Page) ──
    for (const [cat, el] of Object.entries(elements.categories)) {
      if (!el) continue;
      const pageVal = (tabStats && tabStats[cat]) || 0;
      const allTimeVal = (totals && totals[cat]) || 0;
      el.textContent = formatNumber(pageVal);
      el.title = `${pageVal} on page (${allTimeVal} all-time)`;
      if (pageVal === 0) {
        el.className = 'cat-val zero';
      } else {
        el.className = 'cat-val';
      }
    }
  }
};
