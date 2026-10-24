// main-world/network/websocket-guard.js
// Intercepts window.WebSocket to block ad/tracker sockets and DNS rebinding intranet connections.

(() => {
  'use strict';

  window.__SS_MAIN = window.__SS_MAIN || {};
  const { Config, EventBridge } = window.__SS_MAIN;

  window.__SS_MAIN.WebSocketGuard = {
    init() {
      if (!window.WebSocket) return;

      const NativeWebSocket = window.WebSocket;

      const GuardedWebSocket = function (url, protocols) {
        if (!Config.isProtectionEnabled('pageGuards')) {
          return protocols !== undefined
            ? new NativeWebSocket(url, protocols)
            : new NativeWebSocket(url);
        }
        const urlStr = String(url || '');

        // 1. Direct private-address connection check
        if (Config.isPrivateNetworkRequest(urlStr)) {
          console.warn('[SentinelShield] Blocked WebSocket connection to a private address:', urlStr);
          EventBridge.reportPrivateNetworkBlocked('ws-private-address');
          throw new DOMException('Blocked by SentinelShield (private network request)', 'SecurityError');
        }

        // 2. High-confidence ad/tracker host WebSocket connection
        if (Config.isBlockedHost(urlStr)) {
          console.warn('[SentinelShield] Blocked ad/tracker WebSocket:', urlStr);
          if (window.__SS_MAIN.RequestTracker) {
            window.__SS_MAIN.RequestTracker.recordBlockedRequest(urlStr, 'websocket');
          } else {
            EventBridge.reportAdRequestBlocked(urlStr, 'websocket');
          }
          throw new DOMException('Blocked by SentinelShield (Ad/Tracker WebSocket)', 'SecurityError');
        }

        if (protocols !== undefined) {
          return new NativeWebSocket(url, protocols);
        }
        return new NativeWebSocket(url);
      };

      GuardedWebSocket.prototype = NativeWebSocket.prototype;
      GuardedWebSocket.CONNECTING = NativeWebSocket.CONNECTING;
      GuardedWebSocket.OPEN = NativeWebSocket.OPEN;
      GuardedWebSocket.CLOSING = NativeWebSocket.CLOSING;
      GuardedWebSocket.CLOSED = NativeWebSocket.CLOSED;

      try {
        Object.defineProperty(GuardedWebSocket, 'name', { value: 'WebSocket' });
        GuardedWebSocket.toString = () => 'function WebSocket() { [native code] }';
      } catch (_) {}

      window.WebSocket = GuardedWebSocket;
      console.log('[SentinelShield] WebSocket ad & DNS-rebinding guard active');
    }
  };
})();
