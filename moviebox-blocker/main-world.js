// main-world.js  —  runs in the PAGE's JS context at document_start
(() => {
  'use strict';

  // NOTE: we deliberately do NOT override `onResumeWebView`. The page
  // already declares it as `function onResumeWebView() {}` in its own
  // inline <script>. Redefining it with `configurable: false` before
  // that script runs causes a SyntaxError that aborts the entire
  // inline script — which is what defines `window.ath_send`. Without
  // ath_send, every episode-switch click throws a ReferenceError and
  // the SPA never mounts the new player.

  // ── Editable config ────────────────────────────────────────────
  // <video> event types whose addEventListener registrations are
  // silently dropped. Edit this array to change which events are
  // suppressed. Valid HTMLMediaElement event names include:
  //   play, pause, click, playing, waiting, seeking, seeked,
  //   timeupdate, progress, ratechange, volumechange, ended,
  //   loadedmetadata, loadeddata, canplay, canplaythrough, stalled,
  //   suspend, abort, emptied, error, durationchange
//   const SUPPRESSED_VIDEO_EVENTS = ['play', 'pause', 'click'];
  const SUPPRESSED_VIDEO_EVENTS = ['timeupdate'];

  const BLOCKED_HOSTS = [
    // original set
    'pufted.com',
    'medium-while.com',
    'quizzical-topic.com',
    'athena-unify.js',
    'surlyplants.com',
    'hisavana.com',
    // redirect chains injected into <head>/<body>
    'tagivi.com',
    'createlouisville.org',
    'interlinecustomroofingllc.com',
    // previously-commented networks
    'cdn.tsyndicate.com',
    '5gvci.com',
    'nap5k.com',
    'richinfo.co',
    // Adsterra install observed in .mobile-ad-below-player
    'kettledroopingcontinuation.com',
    'highperformanceformat.com',
    'clicks.pipaffiliates.com',
    'cdn.storageimagedisplay.com'
  ];

  const isBlocked = (url) =>
    typeof url === 'string' && BLOCKED_HOSTS.some(h => url.includes(h));

  // ── ad/get-config: sanitized pass-through, NOT a synthetic stub ──
  const AD_CONFIG_PATH = 'h5-api.aoneroom.com/wefeed-h5api-bff/ad/get-config';
  const isAdConfig = (url) =>
    typeof url === 'string' && url.includes(AD_CONFIG_PATH);

  const sanitizeAdConfig = (json) => {
    try {
      if (json && json.data && json.data.adPlans) {
        for (const key of Object.keys(json.data.adPlans)) {
          const plan = json.data.adPlans[key];
          if (plan && Array.isArray(plan.list)) plan.list = [];
        }
      }
    } catch (_) {}
    return json;
  };

  // ── Suspicious <iframe> signature ──────────────────────────────
  const isSuspiciousIframe = (node) => {
    if (!node || node.tagName !== 'IFRAME') return false;
    const id = node.getAttribute && node.getAttribute('id');
    const cls = node.getAttribute && node.getAttribute('class');
    if (typeof id === 'string' && id.startsWith('container-')) return true;
    if (typeof cls === 'string' && cls.split(/\s+/).some(c => c.startsWith('container-'))) return true;
    const style = (node.getAttribute && node.getAttribute('style')) || '';
    if (
      /position\s*:\s*fixed/i.test(style) &&
      /z-index\s*:\s*2\d{9}/i.test(style)
    ) return true;
    const s = node.style;
    if (s && s.position === 'fixed') {
      const z = parseInt(s.zIndex, 10);
      if (z >= 2147483000) return true;
    }
    return false;
  };

  // ── 1. Kill window.open pop-unders ─────────────────────────────
  const realOpen = window.open;
  window.open = function (url, ...rest) {
    if (isBlocked(url) || url === '' || url === 'about:blank') {
      console.warn('[MB-blocker] popup blocked:', url);
      window.dispatchEvent(new CustomEvent('mb-blocked-popup', { detail: url }));
      return null;
    }
    return realOpen.call(window, url, ...rest);
  };

  // ── 2. Stop ad <script> / ad <iframe> from ever attaching ──────
  const nativeAppend = Element.prototype.appendChild;
  Element.prototype.appendChild = function (node) {
    if (node && node.tagName === 'SCRIPT' && isBlocked(node.src)) {
      console.warn('[MB-blocker] script blocked:', node.src);
      window.dispatchEvent(new CustomEvent('mb-blocked-script', { detail: node.src }));
      return node;
    }
    if (node && node.tagName === 'IFRAME') {
      if (node.getAttribute) {
        const srcdoc = node.getAttribute('srcdoc');
        if (srcdoc && isBlocked(srcdoc)) {
          console.warn('[MB-blocker] srcdoc iframe blocked');
          window.dispatchEvent(new CustomEvent('mb-blocked-script', { detail: 'srcdoc-iframe' }));
          return node;
        }
      }
      if (isSuspiciousIframe(node)) {
        console.warn('[MB-blocker] suspicious iframe blocked:', node.id || node.className);
        window.dispatchEvent(new CustomEvent('mb-blocked-script', { detail: 'container-iframe' }));
        return node;
      }
    }
    return nativeAppend.call(this, node);
  };

  const nativeSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (this.tagName === 'SCRIPT' && name === 'src' && isBlocked(value)) {
      console.warn('[MB-blocker] script src blocked:', value);
      return;
    }
    if (this.tagName === 'IFRAME') {
      if (name === 'srcdoc' && isBlocked(value)) {
        console.warn('[MB-blocker] srcdoc iframe blocked (setAttribute)');
        return;
      }
      if ((name === 'id' || name === 'class') &&
          typeof value === 'string' &&
          value.split(/\s+/).some(c => c.startsWith('container-'))) {
        console.warn('[MB-blocker] suspicious iframe id/class blocked:', value);
        return;
      }
      if (name === 'style' && typeof value === 'string' &&
          /position\s*:\s*fixed/i.test(value) &&
          /z-index\s*:\s*2\d{9}/i.test(value)) {
        console.warn('[MB-blocker] suspicious iframe style blocked:', value);
        return;
      }
    }
    return nativeSetAttr.call(this, name, value);
  };

  // ── 3. Block top-level redirects to ad domains ─────────────────
  try {
    const locProto = Object.getPrototypeOf(window.location);
    const desc = Object.getOwnPropertyDescriptor(locProto, 'href');
    if (desc && desc.set) {
      Object.defineProperty(locProto, 'href', {
        get: desc.get,
        set(v) {
          if (isBlocked(v)) {
            console.warn('[MB-blocker] redirect blocked:', v);
            return;
          }
          desc.set.call(this, v);
        }
      });
    }
  } catch (_) { /* Location is often non-configurable — fine */ }

  // ── 4. fetch guard (sanitize ad-config, block bad hosts) ───────
  const nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url);

      if (isAdConfig(url)) {
        return nativeFetch.call(this, input, init).then((res) => {
          if (!res || !res.ok) return res;
          return res.clone().json().then((json) => {
            sanitizeAdConfig(json);
            console.warn('[MB-blocker] sanitized ad/get-config (real response, empty ad lists)');
            window.dispatchEvent(new CustomEvent('mb-blocked-script', { detail: 'ad-config-sanitized' }));
            return new Response(JSON.stringify(json), {
              status: res.status,
              statusText: res.statusText,
              headers: { 'Content-Type': 'application/json' }
            });
          }).catch(() => res);
        });
      }

      if (isBlocked(url)) {
        console.warn('[MB-blocker] fetch blocked:', url);
        window.dispatchEvent(new CustomEvent('mb-blocked-script', { detail: url }));
        return Promise.reject(new Error('blocked'));
      }
      return nativeFetch.call(this, input, init);
    };
  }

  const nativeXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (isBlocked(url)) {
      console.warn('[MB-blocker] xhr blocked:', url);
      window.dispatchEvent(new CustomEvent('mb-blocked-script', { detail: url }));
      return nativeXhrOpen.call(this, method, 'about:blank', ...rest);
    }
    return nativeXhrOpen.call(this, method, url, ...rest);
  };

  // ══════════════════════════════════════════════════════════════
  // Region-lock fallback
  // ══════════════════════════════════════════════════════════════
  const FALLBACK_ID = 'mb-video-fallback';
  let lastVideoState = null;
  let lastLoggedSrc = null;

  const tryCaptureFromVideo = (video) => {
    if (!video || video.tagName !== 'VIDEO') return;

    const attrSrc = video.getAttribute && video.getAttribute('src');
    const propSrc = video.src;

    let src = attrSrc || propSrc;
    if (!src) {
      const source = video.querySelector && video.querySelector('source[src]');
      if (source) src = source.getAttribute('src');
    }
    if (!src || src.startsWith('blob:')) return;

    try { src = new URL(src, location.href).href; } catch (_) {}

    lastVideoState = {
      src,
      currentTime: video.currentTime || 0,
      volume: typeof video.volume === 'number' ? video.volume : 1,
      muted: !!video.muted,
      playbackRate: video.playbackRate || 1,
      crossorigin: video.getAttribute('crossorigin') || null,
      preload: video.getAttribute('preload') || 'metadata',
      poster: video.getAttribute('poster') || null
    };
    if (src !== lastLoggedSrc) {
      lastLoggedSrc = src;
      console.log('[MB-blocker] captured video src:', src.slice(0, 120));
    }
  };

  const scanForVideo = (root) => {
    const scope = root && root.nodeType === 1 ? root : document;
    if (scope.tagName === 'VIDEO') tryCaptureFromVideo(scope);
    if (scope.querySelectorAll) {
      scope.querySelectorAll('video').forEach(tryCaptureFromVideo);
    }
  };

  const captureObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) scanForVideo(node);
        }
      } else if (m.type === 'attributes' && m.target && m.target.tagName === 'VIDEO') {
        tryCaptureFromVideo(m.target);
      }
    }
  });

  const startCaptureObserver = () => {
    captureObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
    scanForVideo(document);
  };

  if (document.documentElement) startCaptureObserver();
  else document.addEventListener('readystatechange', startCaptureObserver, { once: true });

  const mountFallbackVideo = () => {
    if (document.getElementById(FALLBACK_ID)) return;
    if (!lastVideoState || !lastVideoState.src) return;

    const cover = document.querySelector('.video-cover.pc-cover-img');
    if (!cover) return;
    if (!cover.querySelector('.pc-playerr')) return;

    const container =
      document.querySelector('.pc-video-inner') ||
      document.querySelector('.pc-video');
    if (!container) return;

    console.warn('[MB-blocker] region-lock confirmed — mounting fallback');
    window.dispatchEvent(new CustomEvent('mb-blocked-popup', { detail: 'region-lock-fallback' }));

    cover.style.setProperty('display', 'none', 'important');

    const wrapper = document.createElement('div');
    wrapper.id = FALLBACK_ID;
    wrapper.style.cssText =
      'position:relative;width:100%;height:100%;background:#000;z-index:9998;';

    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = lastVideoState.preload;
    if (lastVideoState.crossorigin) video.setAttribute('crossorigin', lastVideoState.crossorigin);
    video.src = lastVideoState.src;
    video.volume = lastVideoState.volume;
    video.muted = lastVideoState.muted;
    video.playbackRate = lastVideoState.playbackRate;
    if (lastVideoState.poster) video.poster = lastVideoState.poster;
    video.style.cssText = 'width:100%;height:100%;display:block;background:#000;';

    video.addEventListener('loadedmetadata', () => {
      try { video.currentTime = lastVideoState.currentTime; } catch (_) {}
      video.play().catch(() => {});
    }, { once: true });

    video.addEventListener('error', () => {
      console.warn('[MB-blocker] fallback video failed:', video.error && video.error.code);
    });

    wrapper.appendChild(video);
    container.appendChild(wrapper);
  };

  const cleanupFallbackIfPlayerReturned = () => {
    const playerBack = document.querySelector('.artplayer-app-pc video');
    if (!playerBack) return;
    const fb = document.getElementById(FALLBACK_ID);
    if (fb) {
      console.log('[MB-blocker] player returned — removing fallback');
      fb.remove();
    }
  };

  setInterval(() => {
    scanForVideo(document);
    cleanupFallbackIfPlayerReturned();
    if (!document.querySelector('.artplayer-app-pc video') &&
        document.querySelector('.video-cover.pc-cover-img') &&
        document.querySelector('.pc-playerr')) {
      mountFallbackVideo();
    }
  }, 250);

  // ── 5. Click swallow ───────────────────────────────────────────
  window.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.style) return;

    const z = parseInt(t.style.zIndex) || 0;
    const isOverlay =
      t.style.position === 'fixed' &&
      z > 100000 &&
      (t.style.background === 'none' ||
        t.style.background === 'transparent' ||
        t.style.background === '');

    const isMbAd =
      (t.classList && (
        t.classList.contains('popup-mask') ||
        t.classList.contains('pc-ads') ||
        t.classList.contains('pc-ads-content') ||
        t.classList.contains('pc-video-Ads') ||
        t.classList.contains('third-party-ad') ||
        t.classList.contains('third-party-ad__iframe') ||
        t.classList.contains('pc-custome-ads-mid')
      )) ||
      (t.closest && t.closest('.popup-mask, .pc-ads, .pc-video-Ads, .third-party-ad, .pc-custome-ads-mid'));

    if (isOverlay || isMbAd) {
      e.stopImmediatePropagation();
      e.preventDefault();
      if (isOverlay) t.remove();
      console.warn('[MB-blocker] ad/overlay click swallowed');
    }
  }, true);

  // ══════════════════════════════════════════════════════════════
  // 6. Suppress <video> event-listener registrations (research mode)
  // ══════════════════════════════════════════════════════════════
  // Silently drops addEventListener registrations on <video> elements
  // for the event types in SUPPRESSED_VIDEO_EVENTS (see top of file).
  // The site's playback state machine never receives these callbacks,
  // so the trial countdown and auto-play logic never advance.
  //
  // NOTE: this only intercepts `addEventListener`. Direct property
  // assignment (`video.onplay = fn`, `video.onclick = fn`) is not
  // affected. Tell me if the site uses that pattern and I'll add
  // property-descriptor hooks for onplay/onpause/onclick too.
  const suppressed = new Set(SUPPRESSED_VIDEO_EVENTS);

  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (
      this instanceof HTMLVideoElement &&
      typeof type === 'string' &&
      suppressed.has(type)
    ) {
      console.warn('[MB-blocker] video listener suppressed:', type);
      window.dispatchEvent(new CustomEvent('mb-blocked-script', { detail: 'video-listener-' + type }));
      return;
    }
    return nativeAddEventListener.call(this, type, listener, options);
  };

  console.log('[MB-blocker] main-world hooks installed');
})();