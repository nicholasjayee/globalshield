import assert from 'node:assert/strict';
import test from 'node:test';
import { isBogonIp, isIpAddress, summarizeDnsResponses } from '../background/dns-utils.js';

const completeResponses = (addresses = ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']) => {
  const responses = [];
  for (const resolver of ['Cloudflare', 'Google', 'AdGuard']) {
    responses.push(
      { resolver, recordType: 'A', status: 0, dnssec: true, ips: [addresses[0]] },
      { resolver, recordType: 'AAAA', status: 0, dnssec: true, ips: [addresses[1]] }
    );
  }
  return responses;
};

test('identifies private, reserved and mapped IPv4 addresses without matching malformed text', () => {
  assert.equal(isBogonIp('10.0.0.1'), true);
  assert.equal(isBogonIp('192.168.1.20'), true);
  assert.equal(isBogonIp('::ffff:7f00:1'), true);
  assert.equal(isBogonIp('::ffff:127.0.0.1'), true);
  assert.equal(isBogonIp('8.8.8.8'), false);
  assert.equal(isBogonIp('10.evil.example'), false);
  assert.equal(isBogonIp('10..0.1'), false);
  assert.equal(isIpAddress('2001:db8::1'), true);
  assert.equal(isIpAddress('999.1.1.1'), false);
});

test('requires all resolver answers to agree before reporting consistency and DNSSEC', () => {
  const verdict = summarizeDnsResponses('example.test', completeResponses(), 6, 123);
  assert.equal(verdict.status, 'consistent');
  assert.equal(verdict.consensus, true);
  assert.equal(verdict.dnssec, true);
  assert.equal(verdict.responseCount, 6);

  const unsignedResponse = completeResponses();
  unsignedResponse[5].dnssec = false;
  assert.equal(summarizeDnsResponses('example.test', unsignedResponse, 6, 123).dnssec, false);
});

test('reports non-public DNS answers separately from ordinary public answer variance', () => {
  const responses = completeResponses();
  responses[2].ips = ['10.1.2.3'];
  const verdict = summarizeDnsResponses('example.test', responses, 6, 123);
  assert.equal(verdict.status, 'non_public_answer');
  assert.equal(verdict.bogonDetected, true);
});

test('reports differing public IPs as answer variance, not proof of attack', () => {
  const responses = completeResponses();
  responses[2].ips = ['93.184.216.35'];
  const verdict = summarizeDnsResponses('example.test', responses, 6, 123);
  assert.equal(verdict.status, 'answers_differ');
  assert.equal(verdict.bogonDetected, false);
  assert.equal(verdict.consensus, false);
});

test('distinguishes NXDOMAIN disagreement, incomplete results, and no responses', () => {
  const responses = completeResponses();
  responses[0] = { ...responses[0], status: 3, ips: [] };
  assert.equal(summarizeDnsResponses('example.test', responses, 6, 123).status, 'divergence_alert');
  assert.equal(summarizeDnsResponses('example.test', responses.slice(0, 4), 6, 123).status, 'partial');
  assert.equal(summarizeDnsResponses('example.test', [], 6, 123).status, 'unreachable');
});
