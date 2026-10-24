'use strict';

const isBogonV4 = (ip) => {
  const strings = ip.split('.');
  if (strings.length !== 4 || strings.some(part => !/^(0|[1-9]\d{0,2})$/.test(part))) {
    return false;
  }
  const octets = strings.map(Number);
  if (octets.some(part => part > 255)) return false;

  const [first, second, third] = octets;
  return first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224;
};

const expandIpv6 = (ip) => {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const parts = [...left, ...Array(missing).fill('0'), ...right];
  if (parts.length !== 8 || parts.some(part => !/^[\da-f]{1,4}$/i.test(part))) return null;
  return parts.map(part => parseInt(part, 16));
};

const isBogonV6 = (ip) => {
  let normalized;
  try {
    normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1).toLowerCase();
  } catch (_) {
    return false;
  }

  if (normalized === '::' || normalized === '::1') return true;
  if (/^(fc|fd)/.test(normalized) || /^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('::ffff:') && normalized.includes('.')) {
    return isBogonV4(normalized.slice('::ffff:'.length));
  }

  const parts = expandIpv6(normalized);
  if (!parts || parts.slice(0, 5).some(part => part !== 0) || parts[5] !== 0xffff) return false;
  const mappedV4 = [
    parts[6] >> 8,
    parts[6] & 255,
    parts[7] >> 8,
    parts[7] & 255
  ].join('.');
  return isBogonV4(mappedV4);
};

export const isIpAddress = (value) => {
  if (typeof value !== 'string') return false;
  const ip = value.trim();
  if (ip.includes(':')) {
    try {
      const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
      return expandIpv6(normalized) !== null ||
        (normalized.startsWith('::ffff:') && isIpAddress(normalized.slice('::ffff:'.length)));
    } catch (_) {
      return false;
    }
  }
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) &&
    ip.split('.').every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
};

export const isBogonIp = (value) => {
  if (typeof value !== 'string') return false;
  const ip = value.trim();
  if (ip.includes(':')) return isBogonV6(ip);
  return isBogonV4(ip);
};

export const summarizeDnsResponses = (domain, responses, expectedResponseCount, timestamp) => {
  const ips = [...new Set(responses.flatMap(response => response.ips))];
  const bogonDetected = ips.some(isBogonIp);
  const hasNxDomain = responses.some(response => response.status === 3);
  const hasAddressAnswer = responses.some(response =>
    response.status === 0 && response.ips.length > 0
  );
  const complete = responses.length === expectedResponseCount;
  const hasResolverError = responses.some(response => response.status !== 0 && response.status !== 3);
  const responseCount = responses.length;
  const answerSets = new Map();

  for (const response of responses) {
    if (response.status !== 0 || response.ips.length === 0) continue;
    const current = [...response.ips].sort().join(',');
    const prior = answerSets.get(response.recordType);
    if (prior === undefined) answerSets.set(response.recordType, new Set([current]));
    else prior.add(current);
  }

  const answerVariance = [...answerSets.values()].some(answers => answers.size > 1);
  let status;
  if (bogonDetected) {
    status = 'non_public_answer';
  } else if (!complete) {
    status = responseCount === 0 ? 'unreachable' : 'partial';
  } else if (hasNxDomain && hasAddressAnswer) {
    status = 'divergence_alert';
  } else if (hasResolverError) {
    status = 'resolver_error';
  } else if (answerVariance) {
    status = 'answers_differ';
  } else if (hasNxDomain) {
    status = 'nxdomain';
  } else if (!hasAddressAnswer) {
    status = 'no_address';
  } else {
    status = 'consistent';
  }

  return {
    domain,
    consensus: status === 'consistent' || status === 'nxdomain' || status === 'no_address',
    dnssec: complete && responses.every(response => response.dnssec),
    status,
    bogonDetected,
    answerVariance,
    ips,
    responseCount,
    resolverCount: new Set(responses.map(response => response.resolver)).size,
    timestamp
  };
};
