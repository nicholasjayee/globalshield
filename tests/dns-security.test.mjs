import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { dnsSecurity } from '../background/dns-security.js';

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

test('queries A and AAAA from each resolver and requires the complete comparison', async () => {
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    requests.push({ host: url.hostname, type: Number(url.searchParams.get('type')) });
    const type = Number(url.searchParams.get('type'));
    const data = type === 1 ? '93.184.216.34' : '2606:2800:220:1:248:1893:25c8:1946';
    return new Response(JSON.stringify({
      Status: 0,
      AD: true,
      Answer: [{ type, data }]
    }), { headers: { 'Content-Type': 'application/json' } });
  };

  const verdict = await dnsSecurity.validateDomain(`dns-check-${Date.now()}.example`);
  assert.equal(requests.length, 6);
  assert.deepEqual(new Set(requests.map(request => request.host)), new Set([
    'cloudflare-dns.com',
    'dns.google',
    'dns.adguard-dns.com'
  ]));
  assert.equal(requests.filter(request => request.type === 1).length, 3);
  assert.equal(requests.filter(request => request.type === 28).length, 3);
  assert.equal(verdict.status, 'consistent');
  assert.equal(verdict.dnssec, true);
});

test('shows a partial check when a resolver request fails', async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.hostname === 'dns.google' && url.searchParams.get('type') === '28') {
      return new Response('', { status: 503 });
    }
    const type = Number(url.searchParams.get('type'));
    return new Response(JSON.stringify({
      Status: 0,
      AD: true,
      Answer: [{ type, data: type === 1 ? '93.184.216.34' : '2606:2800:220:1:248:1893:25c8:1946' }]
    }), { headers: { 'Content-Type': 'application/json' } });
  };

  const verdict = await dnsSecurity.validateDomain(`dns-partial-${Date.now()}.example`);
  assert.equal(verdict.status, 'partial');
  assert.equal(verdict.responseCount, 5);
  assert.equal(verdict.dnssec, false);
});
