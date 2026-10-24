import assert from 'node:assert/strict';
import test from 'node:test';

const state = { local: {} };
const contentCalls = [];
const enabledRulesets = new Set();
let failNextStorageWrite = false;
const makeContentSetting = (type) => ({
  set(options, callback) {
    contentCalls.push({ type, action: 'set', options });
    callback();
  },
  clear(options, callback) {
    contentCalls.push({ type, action: 'clear', options });
    callback();
  }
});

globalThis.chrome = {
  runtime: { lastError: null },
  storage: {
    local: {
      async get(key) {
        return { [key]: state.local[key] };
      },
      async set(value) {
        if (failNextStorageWrite) {
          failNextStorageWrite = false;
          throw new Error('storage unavailable');
        }
        Object.assign(state.local, value);
      }
    }
  },
  declarativeNetRequest: {
    updateEnabledRulesets(options, callback) {
      for (const id of options.enableRulesetIds) enabledRulesets.add(id);
      for (const id of options.disableRulesetIds) enabledRulesets.delete(id);
      callback();
    }
  },
  contentSettings: Object.fromEntries([
    'camera', 'microphone', 'location', 'notifications', 'clipboardReadWrite', 'cookies'
  ].map(type => [type, makeContentSetting(type)]))
};

const { protectionManager } = await import('../background/protection-manager.js');

test('initialization enables filters and applies browser-level device blocks by default', async () => {
  await protectionManager.init();
  assert.deepEqual(enabledRulesets, new Set(['rules_global', 'rules_streaming']));
  for (const type of ['camera', 'microphone', 'location', 'notifications', 'clipboardReadWrite']) {
    assert.ok(contentCalls.some(call =>
      call.type === type && call.action === 'set' && call.options.setting === 'block'
    ), `${type} is blocked by default`);
  }
  assert.equal(protectionManager.getState('example.com').status.blockCamera.applied, true);
});

test('site device exception is scoped to that host and global block revocation clears it', async () => {
  await protectionManager.setSiteDeviceAllow('meet.example.com', 'blockCamera', true);
  const allowCall = contentCalls.at(-1);
  assert.equal(allowCall.type, 'camera');
  assert.equal(allowCall.options.setting, 'allow');
  assert.equal(allowCall.options.primaryPattern, '*://[*.]meet.example.com/*');

  await protectionManager.setGlobal('blockCamera', false);
  assert.ok(contentCalls.some(call =>
    call.type === 'camera' && call.action === 'clear' &&
    call.options.primaryPattern === '*://[*.]meet.example.com/*'
  ));
  assert.equal(protectionManager.getState('meet.example.com').status['allowSite:blockCamera'].enabled, true);
});

test('global site-access toggles clear and reapply their Chrome overrides', async () => {
  const contentTypes = {
    blockCamera: 'camera',
    blockMicrophone: 'microphone',
    blockLocation: 'location',
    blockNotifications: 'notifications',
    blockClipboard: 'clipboardReadWrite'
  };

  for (const [feature, type] of Object.entries(contentTypes)) {
    const start = contentCalls.length;
    await protectionManager.setGlobal(feature, false);
    assert.equal(protectionManager.getState('example.com').status[feature].enabled, false);
    assert.ok(contentCalls.slice(start).some(call =>
      call.type === type && call.action === 'clear' &&
      call.options.scope === 'regular'
    ), `${feature} clears its browser override when disabled`);

    const enableStart = contentCalls.length;
    await protectionManager.setGlobal(feature, true);
    assert.equal(protectionManager.getState('example.com').status[feature].enabled, true);
    assert.ok(contentCalls.slice(enableStart).some(call =>
      call.type === type && call.action === 'set' &&
      call.options.primaryPattern === '<all_urls>' &&
      call.options.setting === 'block'
    ), `${feature} reapplies the global block when enabled`);
  }
});

test('network rulesets can be changed without disabling the other protection ruleset', async () => {
  await protectionManager.setGlobal('networkFiltering', false);
  assert.deepEqual(enabledRulesets, new Set(['rules_streaming']));
  await protectionManager.setGlobal('networkFiltering', true);
  assert.deepEqual(enabledRulesets, new Set(['rules_global', 'rules_streaming']));
});

test('site cosmetic exception is persisted separately from the global preference', async () => {
  await protectionManager.setSiteCosmetic('youtube.com', false);
  assert.equal(protectionManager.getState('youtube.com').cosmeticEnabled, false);
  assert.equal(protectionManager.getState('example.com').cosmeticEnabled, true);
});

test('page guard and fingerprint exceptions can be independently changed per site', async () => {
  await protectionManager.setSiteFeature('youtube.com', 'pageGuards', false);
  await protectionManager.setSiteFeature('youtube.com', 'antiFingerprinting', false);
  const state = protectionManager.getState('youtube.com');
  assert.equal(state.siteFeatures.pageGuards, false);
  assert.equal(state.siteFeatures.antiFingerprinting, false);
  assert.equal(protectionManager.getState('example.com').siteFeatures.pageGuards, true);
});

test('failed site device preference persistence rolls back the in-memory change', async () => {
  failNextStorageWrite = true;
  await assert.rejects(
    protectionManager.setSiteDeviceAllow('another.example.net', 'blockCamera', true),
    /storage unavailable/
  );
  assert.equal(
    protectionManager.getState('another.example.net').status['allowSite:blockCamera'].enabled,
    false
  );
});
