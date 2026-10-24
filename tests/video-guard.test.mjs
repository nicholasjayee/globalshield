import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../main-world/streaming/video-guard.js', import.meta.url),
  'utf8'
);

const createGuard = ({ streaming = true, pageGuards = true } = {}) => {
  const registered = [];
  const blocked = [];
  class MockEventTarget {
    addEventListener(type, listener, options) {
      registered.push({ target: this, type, listener, options });
    }
  }
  class MockVideoElement extends MockEventTarget {}
  class MockElement extends MockEventTarget {}
  const main = {
    Config: {
      SUPPRESSED_VIDEO_EVENTS: ['timeupdate'],
      isStreamingTarget: () => streaming,
      isProtectionEnabled: (feature) => feature !== 'pageGuards' || pageGuards
    },
    EventBridge: {
      reportScriptBlocked: (reason) => blocked.push(reason)
    }
  };
  const context = {
    window: { __SS_MAIN: main },
    EventTarget: MockEventTarget,
    HTMLVideoElement: MockVideoElement,
    console: { log() {}, warn() {} }
  };
  vm.runInNewContext(source, context);
  main.VideoGuard.init();
  return { main, registered, blocked, MockVideoElement, MockElement };
};

test('suppresses timeupdate registration only for video elements on streaming targets', () => {
  const guard = createGuard();
  const video = new guard.MockVideoElement();
  const other = new guard.MockElement();
  const listener = () => {};

  video.addEventListener('timeupdate', listener);
  video.addEventListener('play', listener);
  other.addEventListener('timeupdate', listener);

  assert.deepEqual(guard.registered.map(item => item.type), ['play', 'timeupdate']);
  assert.deepEqual(guard.blocked, ['video-listener-timeupdate']);
});

test('does not suppress when page guards are disabled or the host is not a streaming target', () => {
  const disabledProtection = createGuard({ pageGuards: false });
  new disabledProtection.MockVideoElement().addEventListener('timeupdate', () => {});
  assert.equal(disabledProtection.registered.length, 1);

  const otherSite = createGuard({ streaming: false });
  new otherSite.MockVideoElement().addEventListener('timeupdate', () => {});
  assert.equal(otherSite.registered.length, 1);
});
